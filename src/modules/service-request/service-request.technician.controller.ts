import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";
import { success } from "zod";

export const getMyAssignedRequests = async (req: Request, res: Response) => {
  try {
    const technicianId = req.employee?.employee_id;

    if (!technicianId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await pool.query(
      `SELECT 
          sr.service_request_id,
          sr.subject as title,
          sr.description,
          sr.address,
          sr.status,
          sr.priority,
          sr.customer_id,
          sr.created_at,
          sr.updated_at,
          c.first_name || ' ' || c.last_name as customer_name,
          c.email as customer_email,
          c.phone as customer_phone,
          p.product_name,
          m.model_number,
          m.serial_number,
          sra.assigned_at
        FROM service_request sr
        INNER JOIN service_request_assignment sra
           ON sr.service_request_id = sra.service_request_id
        LEFT JOIN customer_user c ON sr.customer_id = c.customer_id
        LEFT JOIN machines m ON sr.machine_id = m.machine_id
        LEFT JOIN product p ON m.product_id = p.product_id
        WHERE sra.employee_id = $1 AND sra.active = true
        ORDER BY sr.created_at DESC`,
      [technicianId],
    );

    return res.json({
      success: true,
      data: {
        requests: result.rows,
      },
    });
  } catch (error) {
    logger.error("Get my assigned requests error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assigned requests",
    });
  }
};

export const updateMyRequestStatus = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;
    const technicianId = req.employee?.employee_id;

    if (!technicianId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const assignmentCheck = await pool.query(
      `SELECT 1 FROM service_request_assignment
       WHERE service_request_id = $1 AND employee_id = $2 AND active = true`,
      [requestId, technicianId],
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this request",
      });
    }

    await pool.query(
      `UPDATE service_request
       SET status = $1, updated_at = NOW()
       WHERE service_request_id = $2`,
      [status, requestId],
    );

    return res.json({
      success: true,
      message: "Status updated successfully",
    });
  } catch (error) {
    logger.error("Update rquest status error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to update status",
    });
  }
};

export const getMyRequestNotes = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const technicianId = req.employee?.employee_id;

    if (!technicianId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const assignmentCheck = await pool.query(
      `SELECT id FROM service_request_assignment
       WHERE service_request_id = $1 AND employee_id = $2 AND active = true`,
      [requestId, technicianId],
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this request",
      });
    }

    const result = await pool.query(
      `SELECT 
        srn.note_id,
        srn.service_request_id,
        srn.employee_id,
        srn.note_text,
        srn.is_internal,
        srn.created_at,
        srn.updated_at,
        e.firstname || ' ' || e.lastname as author_name,
        e.email as author_email
      FROM service_request_notes srn
      LEFT JOIN employee e ON srn.employee_id = e.employee_id
      WHERE srn.service_request_id = $1
      ORDER BY srn.created_at DESC`,
      [requestId],
    );

    return res.json({
      success: true,
      data: {
        notes: result.rows,
      },
    });
  } catch (error) {
    logger.error("Get technician request notes error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notes",
    });
  }
};

export const createMyRequestNote = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { note_text } = req.body;
    const technicianId = req.employee?.employee_id;

    if (!technicianId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const assignmentCheck = await pool.query(
      `SELECT id FROM service_request_assignment
       WHERE service_request_id = $1 AND employee_id = $2 AND active = true`,
      [requestId, technicianId],
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this request",
      });
    }

    const result = await pool.query(
      `INSERT INTO service_request_notes 
        (service_request_id, employee_id, note_text, is_internal, created_at, updated_at)
      VALUES ($1, $2, $3, true, NOW(), NOW())
      RETURNING 
        note_id,
        service_request_id,
        employee_id,
        note_text,
        is_internal,
        created_at,
        updated_at`,
      [requestId, technicianId, note_text],
    );

    const noteWithAuthor = await pool.query(
      `SELECT
        srn.*,
        e.firstname || ' ' || e.lastname as author_name,
        e.email as author_email
      FROM service_request_notes srn
      LEFT JOIN employee e ON srn.employee_id = e.employee_id
      WHERE srn.note_id = $1`,
      [result.rows[0].note_id],
    );

    logger.info("Technician note created", {
      note_id: result.rows[0].note_id,
      service_requst_id: requestId,
      employee_id: technicianId,
    });

    return res.status(201).json({
      success: true,
      message: "Note added successfully",
      data: noteWithAuthor.rows[0],
    });
  } catch (error) {
    logger.error("Create technician request note error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to create note",
    });
  }
};
