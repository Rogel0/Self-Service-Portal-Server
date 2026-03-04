import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";

export const createServiceRequest = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    // const { machineId, subject, description, priority } = req.body;
    const { machine_id, subject, description, priority } = req.body;

    const result = await pool.query(
      `INSERT INTO service_request 
      (customer_id, machine_id, subject, description, priority, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
       RETURNING service_request_id as id, customer_id, machine_id, subject, description, priority, status, created_at`,
      [
        customerId,
        // machineId || null,
        machine_id || null,
        subject,
        description || null,
        priority || "medium",
      ],
    );

    logger.info("Service request created", {
      service_request_id: result.rows[0].id,
      customer_id: customerId,
    });

    return res.status(201).json({
      success: true,
      message: "Service request created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    logger.error("Create service request error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to create service request",
    });
  }
};

export const getMyServiceRequests = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
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
        m.serial_number as machine_name,
        m.model_number
       FROM service_request sr
       LEFT JOIN machines m ON sr.machine_id = m.machine_id
       WHERE sr.customer_id = $1
       ORDER BY sr.created_at DESC`,
      [customerId],
    );

    return res.json(result.rows);
  } catch (error) {
    logger.error("Get service requests error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch service requests",
    });
  }
};

export const getServiceRequestDetails = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;
  const { requestId } = req.params;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
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
        m.serial_number,
        m.model_number,
        p.product_name
       FROM service_request sr
       LEFT JOIN machines m ON sr.machine_id = m.machine_id
       LEFT JOIN product p ON m.product_id = p.product_id
       WHERE sr.service_request_id = $1 AND sr.customer_id = $2`,
      [requestId, customerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error("Get service request details error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch service request details",
    });
  }
};

export const updateServiceRequest = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { status, notes } = req.body;

    const result = await pool.query(
      `UPDATE service_request
            SET status = $1, updated_at = NOW()
            WHERE service_request_id = $2
            RETURNING service_request_id as id, status, updated_at`,
      [status, requestId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    logger.info("Service request status updated", {
      service_request_id: requestId,
      status,
    });

    return res.json({
      success: true,
      message: "Service request status updated",
      data: result.rows[0],
    });
  } catch (error) {
    logger.error("Update service request error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to update service request",
    });
  }
};
