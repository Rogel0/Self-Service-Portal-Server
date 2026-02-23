import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";

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
        sr.assigned_to,
        sr.created_at,
        sr.updated_at,
        cu.first_name,
        cu.last_name,
        cu.company_name,
        m.serial_number as machine_name,
        m.model_number,
        e.firstname || ' ' || e.lastname as assigned_to_name
       FROM service_request sr
       LEFT JOIN customer_user cu ON sr.customer_id = cu.customer_id
       LEFT JOIN machines m ON sr.machine_id = m.machine_id
       LEFT JOIN employee e ON sr.assigned_to = e.employee_id
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

    query += ` ORDER BY sr.created_at DESC LIMIT 100`;

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
        sr.assigned_to,
        sr.created_at,
        sr.updated_at,
        cu.first_name,
        cu.last_name,
        cu.company_name,
        m.serial_number as machine_name,
        m.model_number,
        e.firstname || ' ' || e.lastname as assigned_to_name
      FROM service_request sr
      LEFT JOIN customer_user cu ON sr.customer_id = cu.customer_id
      LEFT JOIN machines m ON sr.machine_id = m.machine_id
      LEFT JOIN employee e ON sr.assigned_to = e.employee_id
      WHERE sr.service_request_id = $1`,
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

export const updateServiceRequest = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { status, assigned_to, priority } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${paramCount++}`);
      values.push(assigned_to);
    }
    if (priority) {
      updates.push(`priority = $${paramCount++}`);
      values.push(priority);
    }

    updates.push(`updated_at = NOW()`);
    values.push(requestId);

    const result = await pool.query(
      `UPDATE service_request
      SET ${updates.join(", ")}
      WHERE service_request_id = $${paramCount}
      RETURNING service_request_id as id, status, assigned_to, priority, updated_at`,
      values,
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    logger.error("Update service request error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to update" });
  }
};
