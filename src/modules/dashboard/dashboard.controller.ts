import { Request, Response } from "express";
import pool from "../../config/database";

export const getDashboardMetrics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, status, technicianId, productId } = req.query;

    const conditions: string[] = ["1=1"];
    const params: any[] = [];
    let paramCount = 1;

    if (startDate) {
      conditions.push(`sr.created_at >= $${paramCount}`);
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      conditions.push(`sr.created_at <= $${paramCount}`);
      params.push(endDate);
      paramCount++;
    }

    if (status) {
      conditions.push(`sr.status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (technicianId) {
      conditions.push(`sra.employee_id = $${paramCount}`);
      params.push(technicianId);
      paramCount++;
    }

    if (productId) {
      conditions.push(`m.product_id = $${paramCount}`);
      params.push(productId);
      paramCount++;
    }

    const whereClause = conditions.join(" AND ");

    const statusQuery = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE sr.status = 'new') as new_count,
        COUNT(*) FILTER (WHERE sr.status = 'assigned') as assigned_count,
        COUNT(*) FILTER (WHERE sr.status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE sr.status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE sr.status = 'cancelled') as cancelled_count,
        COUNT(*) as total_count
      FROM service_request sr
      LEFT JOIN service_request_assignment sra ON sr.service_request_id = sra.service_request_id AND sra.active = true
      LEFT JOIN machines m ON sr.machine_id = m.machine_id
      WHERE ${whereClause}`,
      params,
    );

    const avgResolutionQuery = await pool.query(
      `SELECT 
        AVG(EXTRACT(EPOCH FROM (sr.updated_at - sr.created_at))/3600) as avg_hours
      FROM service_request sr
      LEFT JOIN service_request_assignment sra ON sr.service_request_id = sra.service_request_id AND sra.active = true
      LEFT JOIN machines m ON sr.machine_id = m.machine_id
      WHERE ${whereClause} AND sr.status = 'completed'`,
      params,
    );

    const timeseriesQuery = await pool.query(
      `SELECT 
        DATE(sr.created_at) as date,
        COUNT(*) as created_count,
        COUNT(*) FILTER (WHERE sr.status = 'completed') as completed_count
      FROM service_request sr
      LEFT JOIN service_request_assignment sra ON sr.service_request_id = sra.service_request_id AND sra.active = true
      LEFT JOIN machines m ON sr.machine_id = m.machine_id
      WHERE ${whereClause}
      GROUP BY DATE(sr.created_at)
      ORDER BY DATE(sr.created_at) DESC
      LIMIT 30`,
      params,
    );

    const technicianQuery = await pool.query(
      `SELECT 
        e.employee_id as id,
        e.firstname || ' ' || e.lastname as name,
        COUNT(*) FILTER (WHERE sr.status IN ('assigned', 'in_progress')) as active_count,
        COUNT(*) FILTER (WHERE sr.status = 'completed') as completed_count,
        AVG(EXTRACT(EPOCH FROM (sr.updated_at - sr.created_at))/3600) FILTER (WHERE sr.status = 'completed') as avg_resolution_hours
      FROM employee e
      JOIN department d ON e.department_id = d.dept_id
      LEFT JOIN service_request_assignment sra ON e.employee_id = sra.employee_id AND sra.active = true
      LEFT JOIN service_request sr ON sra.service_request_id = sr.service_request_id
      WHERE d.dept_name = 'services'
      GROUP BY e.employee_id, e.firstname, e.lastname
      ORDER BY active_count DESC, completed_count DESC`,
      [],
    );

    const topProductsQuery = await pool.query(
      `SELECT 
        p.product_id as id,
        p.product_name as product_name,
        '' as model_number,
        COUNT(sr.service_request_id) as request_count,
        COUNT(*) FILTER (WHERE sr.status = 'completed') as completed_count,
        AVG(EXTRACT(EPOCH FROM (sr.updated_at - sr.created_at))/3600) FILTER (WHERE sr.status = 'completed') as avg_resolution_hours
      FROM service_request sr
      LEFT JOIN service_request_assignment sra ON sr.service_request_id = sra.service_request_id AND sra.active = true
      LEFT JOIN machines m ON sr.machine_id = m.machine_id
      LEFT JOIN product p ON m.product_id = p.product_id
      WHERE ${whereClause} AND p.product_id IS NOT NULL
      GROUP BY p.product_id, p.product_name
      ORDER BY request_count DESC
      LIMIT 10`,
      params,
    );

    const queueAgeQuery = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (NOW() - sr.created_at))/3600 < 24) as under_24h,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (NOW() - sr.created_at))/3600 BETWEEN 24 AND 72) as between_24_72h,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (NOW() - sr.created_at))/86400 BETWEEN 3 AND 7) as between_3_7d,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (NOW() - sr.created_at))/86400 > 7) as over_7d
      FROM service_request sr
      LEFT JOIN service_request_assignment sra ON sr.service_request_id = sra.service_request_id AND sra.active = true
      LEFT JOIN machines m ON sr.machine_id = m.machine_id
      WHERE ${whereClause} AND sr.status IN ('new', 'assigned', 'in_progress')`,
      params,
    );

    const recentActivityQuery = await pool.query(
      `SELECT 
        sr.service_request_id as request_id,
        sr.subject,
        sr.status,
        sr.updated_at,
        e.firstname || ' ' || e.lastname as technician_name,
        cu.company_name as customer_name,
        'status_change' as activity_type
      FROM service_request sr
      LEFT JOIN service_request_assignment sra ON sr.service_request_id = sra.service_request_id AND sra.active = true
      LEFT JOIN machines m ON sr.machine_id = m.machine_id
      LEFT JOIN employee e ON sra.employee_id = e.employee_id
      LEFT JOIN customer_user cu ON sr.customer_id = cu.customer_id
      WHERE ${whereClause}
      ORDER BY sr.updated_at DESC
      LIMIT 20`,
      params,
    );

    res.json({
      statusCounts: statusQuery.rows[0],
      avgResolutionHours: avgResolutionQuery.rows[0]?.avg_hours || 0,
      timeseries: timeseriesQuery.rows.reverse(),
      technicianWorkload: technicianQuery.rows,
      topProducts: topProductsQuery.rows,
      queueAge: queueAgeQuery.rows[0],
      recentActivity: recentActivityQuery.rows,
    });
  } catch (error) {
    console.error("Error fetching dashboard metrics:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard metrics" });
  }
};

export const getFilterOptions = async (req: Request, res: Response) => {
  try {
    const technicians = await pool.query(
      `SELECT e.employee_id as id, e.firstname || ' ' || e.lastname as name 
       FROM employee e 
       JOIN department d ON e.department_id = d.dept_id
       WHERE d.dept_name = 'services' 
       ORDER BY e.firstname, e.lastname`,
    );

    const products = await pool.query(
      `SELECT DISTINCT p.product_id as id, p.product_name as name, '' as model_number 
       FROM product p
       INNER JOIN machines m ON p.product_id = m.product_id
       INNER JOIN service_request sr ON m.machine_id = sr.machine_id
       ORDER BY p.product_name`,
    );

    res.json({
      technicians: technicians.rows,
      products: products.rows,
      statuses: [
        { value: "new", label: "New" },
        { value: "assigned", label: "Assigned" },
        { value: "in_progress", label: "In Progress" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
      ],
    });
  } catch (error) {
    console.error("Error fetching filter options:", error);
    res.status(500).json({ message: "Failed to fetch filter options" });
  }
};
