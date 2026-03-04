import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";
import { success } from "zod";

export const getAllServiceRequests = async (req: Request, res: Response) => {
  try {
    const { status, priority, q } = req.query;

    let query = `
      SELECT 
        sr.service_request_id as id,
        sr.customer_id,
        sr.machine_id,
        sr.subject,
        sr.description,
        sr.priority,
        sr.status,
        sr.created_at,
        sr.updated_at,
        cu.first_name,
        cu.last_name,
        cu.company_name,
        m.serial_number as machine_name,
        m.model_number,
        COALESCE(
          json_agg(
            json_build_object(
              'id', e.employee_id,
              'name', e.firstname || ' ' || e.lastname,
              'email', e.email
            )
          ) FILTER (WHERE sra.employee_id IS NOT NULL AND sra.active = true),
          '[]'
        ) as assigned_technicians
       FROM service_request sr
       LEFT JOIN customer_user cu ON sr.customer_id = cu.customer_id
       LEFT JOIN machines m ON sr.machine_id = m.machine_id
       LEFT JOIN service_request_assignment sra ON sr.service_request_id = sra.service_request_id AND sra.active = true
       LEFT JOIN employee e ON sra.employee_id = e.employee_id
       WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 1;

    if (status && status !== "all") {
      query += ` AND sr.status = $${paramCount++}`;
      params.push(status);
    }

    if (priority && priority !== "all") {
      query += ` AND sr.priority = $${paramCount++}`;
      params.push(priority);
    }

    if (q) {
      query += ` AND (sr.subject ILIKE $${paramCount} OR cu.company_name ILIKE $${paramCount} OR m.model_number ILIKE $${paramCount})`;
      params.push(`%${q}%`);
      paramCount++;
    }

    query += ` GROUP BY sr.service_request_id, cu.customer_id, m.machine_id ORDER BY sr.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);

    return res.json(result.rows);
  } catch (error) {
    logger.error("Get all service requests error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch service requests",
    });
  }
};

export const getServiceRequestById = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;

    const result = await pool.query(
      `SELECT 
        sr.service_request_id as id,
        sr.customer_id,
        sr.machine_id,
        sr.subject,
        sr.description,
        sr.priority,
        sr.status,
        sr.created_at,
        sr.updated_at,
        cu.first_name,
        cu.last_name,
        cu.company_name,
        m.serial_number as machine_name,
        m.model_number,
        COALESCE(
          json_agg(
            json_build_object(
              'id', e.employee_id,
              'name', e.firstname || ' ' || e.lastname,
              'email', e.email
            )
          ) FILTER (WHERE sra.employee_id IS NOT NULL AND sra.active = true),
          '[]'
        ) as assigned_technicians
      FROM service_request sr
      LEFT JOIN customer_user cu ON sr.customer_id = cu.customer_id
      LEFT JOIN machines m ON sr.machine_id = m.machine_id
      LEFT JOIN service_request_assignment sra ON sr.service_request_id = sra.service_request_id AND sra.active = true
      LEFT JOIN employee e ON sra.employee_id = e.employee_id
      WHERE sr.service_request_id = $1
      GROUP BY sr.service_request_id, cu.customer_id, m.machine_id`,
      [requestId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    logger.error("Get service request by ID error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch service request",
    });
  }
};

// export const updateServiceRequest = async (req: Request, res: Response) => {
//   try {
//     const { requestId } = req.params;
//     const { status, assigned_to, priority } = req.body;

//     const updates = [];
//     const values = [];
//     let paramCount = 1;

//     if (status) {
//       updates.push(`status = $${paramCount++}`);
//       values.push(status);
//     }
//     if (assigned_to !== undefined) {
//       updates.push(`assigned_to = $${paramCount++}`);
//       values.push(assigned_to);
//     }
//     if (priority) {
//       updates.push(`priority = $${paramCount++}`);
//       values.push(priority);
//     }

//     updates.push(`updated_at = NOW()`);
//     values.push(requestId);

//     const result = await pool.query(
//       `UPDATE service_request
//       SET ${updates.join(", ")}
//       WHERE service_request_id = $${paramCount}
//       RETURNING service_request_id as id, status, assigned_to, priority, updated_at`,
//       values,
//     );

//     if (result.rows.length === 0) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Request not found" });
//     }

//     return res.json(result.rows[0]);
//   } catch (error) {
//     logger.error("Update service request error", { error });
//     return res
//       .status(500)
//       .json({ success: false, message: "Failed to update" });
//   }
// };

// export const updateServiceRequest = async (req: Request, res: Response) => {
//   const client = await pool.connect();

//   try {
//     const { requestId } = req.params;
//     const { assigned_to, status, priority } = req.body;

//     await client.query("BEGIN");

//     const updates: string[] = [];
//     const values: any[] = [];
//     let paramIndex = 1;

//     if (assigned_to !== undefined) {
//       updates.push(`assigned_to = $${paramIndex++}`);
//       values.push(assigned_to);
//     }
//     if (status) {
//       updates.push(`status = $${paramIndex++}`);
//       values.push(status);
//     }
//     if (priority) {
//       updates.push(`priority = $${paramIndex++}`);
//       values.push(priority);
//     }

//     if (updates.length > 0) {
//       updates.push(`updated_at = NOW()`);
//       values.push(requestId);

//       const updateQuery = `
//         UPDATE service_request
//         SET ${updates.join(", ")}
//         WHERE service_request_id = $${paramIndex}`;
//       await client.query(updateQuery, values);
//     }

//     updates.push(`updated_at = NOW()`);
//     values.push(requestId);

//     const query = `
//   UPDATE service_request
//   SET ${updates.join(", ")}
//   WHERE service_request_id = $${paramIndex}
//   RETURNING *`;

//     const result = await pool.query(query, values);

//     if (result.rows.length === 0) {
//       return res.status(404).json({ message: "Service request not found" });
//     }

//     res.json(result.rows[0]);
//   } catch (error) {
//     logger.error("Update service request error", { error });
//     return res
//       .status(500)
//       .json({ success: false, message: "Failed to update service request" });
//   }
// };

export const updateServiceRequest = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { requestId } = req.params;
    const { status, priority } = req.body;

    await client.query("BEGIN");

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }

    if (updates.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(requestId);

    const query = `
      UPDATE service_request
      SET ${updates.join(", ")}
      WHERE service_request_id = $${paramIndex}
      RETURNING *`;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    await client.query("COMMIT");
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Update service request error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to update service request",
    });
  } finally {
    client.release();
  }
};

export const assignTechnician = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { requestId } = req.params;
    const { technician_id } = req.body;
    const assignedBy = req.employee?.employee_id;

    await client.query("BEGIN");

    const requestCheck = await client.query(
      "SELECT service_request_id FROM service_request WHERE service_request_id = $1",
      [requestId],
    );

    if (requestCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    const techCheck = await client.query(
      `SELECT e.employee_id 
       FROM employee e 
       JOIN department d ON e.department_id = d.dept_id 
       WHERE e.employee_id = $1 AND d.dept_name = 'services'`,
      [technician_id],
    );

    if (techCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Invalid technician: must be from services department",
      });
    }

    // Check for existing assignment (active or inactive)
    const duplicateCheck = await client.query(
      `SELECT id, active FROM service_request_assignment
      WHERE service_request_id = $1
      AND employee_id = $2`,
      [requestId, technician_id],
    );

    if (duplicateCheck.rows.length > 0) {
      const existing = duplicateCheck.rows[0];

      // If already active, return 409
      if (existing.active) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "Technician is already assigned to this request",
        });
      }

      // If inactive, reactivate it instead of inserting
      await client.query(
        `UPDATE service_request_assignment 
         SET active = true, assigned_by = $1, assigned_at = NOW()
         WHERE id = $2`,
        [assignedBy, existing.id],
      );
    } else {
      // No existing assignment, insert new one
      await client.query(
        `INSERT INTO service_request_assignment 
         (service_request_id, employee_id, assigned_by, assigned_at, active)
         VALUES ($1, $2, $3, NOW(), true)`,
        [requestId, technician_id, assignedBy],
      );
    }

    // Update service request status
    await client.query(
      `UPDATE service_request 
       SET status = CASE 
         WHEN status = 'pending' THEN 'assigned' 
         ELSE status 
       END,
       updated_at = NOW()
       WHERE service_request_id = $1`,
      [requestId],
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Technician assigned successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Assign technician error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to assign technician",
    });
  } finally {
    client.release();
  }
};

export const unassignTechnician = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { requestId, technicianId } = req.params;

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE service_request_assignment 
       SET active = false
       WHERE service_request_id = $1 
       AND employee_id = $2 
       AND active = true
       RETURNING id`,
      [requestId, technicianId],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Assignment not found or already removed",
      });
    }

    const remainingAssignments = await client.query(
      `SELECT COUNT(*) as count
      FROM service_request_assignment
      WHERE service_request_id = $1 AND active = true`,
      [requestId],
    );

    if (parseInt(remainingAssignments.rows[0].count) === 0) {
      await client.query(
        `UPDATE service_request
        SET status = 'pending', updated_at = NOW()
        WHERE service_request_id = $1`,
        [requestId],
      );
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Technician unassigned successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Unassign technician error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to unassign technician",
    });
  } finally {
    client.release();
  }
};
