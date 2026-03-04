import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";

// Get parts requests for sales verification
export const getPartsRequestsForVerification = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        pr.request_id,
        pr.customer_id,
        pr.machine_id,
        pr.status,
        pr.total_amount,
        pr.payment_verified,
        pr.payment_proof_url,
        pr.call_verified,
        pr.call_verified_at,
        pr.notes,
        pr.created_at,
        pr.updated_at,
        cu.first_name || ' ' || cu.last_name as customer_name,
        cu.email as customer_email,
        cu.phone as customer_phone,
        m.serial_number,
        m.model_number,
        json_agg(
          json_build_object(
            'item_id', pri.item_id,
            'parts_id', pri.parts_id,
            'quantity', pri.quantity,
            'unit_price', pri.unit_price,
            'subtotal', pri.subtotal,
            'parts_name', p.parts_name,
            'description', p.description
          )
        ) as items
       FROM parts_request pr
       JOIN customer_user cu ON pr.customer_id = cu.customer_id
       JOIN machines m ON pr.machine_id = m.machine_id
       JOIN parts_request_items pri ON pr.request_id = pri.request_id
       JOIN parts p ON pri.parts_id = p.parts_id
       WHERE pr.status IN ('pending', 'quote_accepted', 'payment_pending')
       GROUP BY pr.request_id, pr.customer_id, pr.machine_id, pr.status, pr.total_amount,
                pr.payment_verified, pr.payment_proof_url, pr.call_verified, pr.call_verified_at,
                pr.notes, pr.created_at, pr.updated_at, cu.first_name, cu.last_name, cu.email,
                cu.phone, m.serial_number, m.model_number
       ORDER BY pr.created_at DESC`
    );

    return res.json({
      success: true,
      data: { requests: result.rows },
    });
  } catch (error) {
    logger.error("Get parts requests for verification error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch parts requests",
    });
  }
};

// Send quote to customer
export const sendQuote = async (req: Request, res: Response) => {
  const employeeId = req.employee?.employee_id;
  const { requestId } = req.params;

  if (!employeeId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    // Update status to quote_sent
    await pool.query(
      `UPDATE parts_request 
       SET status = 'quote_sent', updated_at = NOW()
       WHERE request_id = $1`,
      [requestId]
    );

    // Get customer email
    const customerResult = await pool.query(
      `SELECT cu.email, cu.first_name || ' ' || cu.last_name as customer_name
       FROM parts_request pr
       JOIN customer_user cu ON pr.customer_id = cu.customer_id
       WHERE pr.request_id = $1`,
      [requestId]
    );

    // TODO: Send email with quote

    logger.info("Quote sent", {
      request_id: requestId,
      employee_id: employeeId,
    });

    return res.json({
      success: true,
      message: "Quote sent successfully",
    });
  } catch (error) {
    logger.error("Send quote error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to send quote",
    });
  }
};

// Verify call
export const verifyCall = async (req: Request, res: Response) => {
  const employeeId = req.employee?.employee_id;
  const { requestId } = req.params;
  const { call_verified, notes } = req.body;

  if (!employeeId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    await pool.query(
      `UPDATE parts_request 
       SET call_verified = $1,
           call_verified_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
           notes = COALESCE($2, notes),
           updated_at = NOW()
       WHERE request_id = $3`,
      [call_verified, notes, requestId]
    );

    logger.info("Call verification updated", {
      request_id: requestId,
      employee_id: employeeId,
      call_verified,
    });

    return res.json({
      success: true,
      message: "Call verification updated",
    });
  } catch (error) {
    logger.error("Verify call error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to update call verification",
    });
  }
};

// Verify payment
export const verifyPayment = async (req: Request, res: Response) => {
  const employeeId = req.employee?.employee_id;
  const { requestId } = req.params;
  const { payment_verified, notes } = req.body;

  if (!employeeId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    await pool.query(
      `UPDATE parts_request 
       SET payment_verified = $1,
           status = CASE WHEN $1 = true THEN 'payment_verified' ELSE 'payment_pending' END,
           verified_by = $2,
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE request_id = $4`,
      [payment_verified, employeeId, notes, requestId]
    );

    // If payment verified, move to preparing status
    if (payment_verified) {
      await pool.query(
        `UPDATE parts_request 
         SET status = 'preparing', updated_at = NOW()
         WHERE request_id = $1`,
        [requestId]
      );

      // Create shipment tracking entry if it doesn't exist
      const trackingCheck = await pool.query(
        `SELECT tracking_id FROM shipment_tracking WHERE request_id = $1`,
        [requestId]
      );

      if (trackingCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO shipment_tracking (request_id, courier_type, status, updated_at)
           VALUES ($1, 'own_delivery', 'preparing', NOW())`,
          [requestId]
        );
      } else {
        await pool.query(
          `UPDATE shipment_tracking 
           SET status = 'preparing', updated_at = NOW()
           WHERE request_id = $1`,
          [requestId]
        );
      }
    }

    logger.info("Payment verification updated", {
      request_id: requestId,
      employee_id: employeeId,
      payment_verified,
    });

    return res.json({
      success: true,
      message: "Payment verification updated",
    });
  } catch (error) {
    logger.error("Verify payment error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to update payment verification",
    });
  }
};

// Accept request and pass to logistics
export const acceptRequest = async (req: Request, res: Response) => {
  const employeeId = req.employee?.employee_id;
  const { requestId } = req.params;

  if (!employeeId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const client = await pool.connect();
    await client.query("BEGIN");

    // Verify request is ready
    const requestCheck = await pool.query(
      `SELECT status, payment_verified, call_verified FROM parts_request 
       WHERE request_id = $1`,
      [requestId]
    );

    if (requestCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const request = requestCheck.rows[0];

    if (!request.payment_verified || !request.call_verified) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(400).json({
        success: false,
        message: "Payment and call verification required before accepting",
      });
    }

    // Update request status
    await pool.query(
      `UPDATE parts_request 
       SET status = 'preparing',
           verified_by = $1,
           updated_at = NOW()
       WHERE request_id = $2`,
      [employeeId, requestId]
    );

    // Create or update shipment tracking
    const trackingCheck = await pool.query(
      `SELECT tracking_id FROM shipment_tracking WHERE request_id = $1`,
      [requestId]
    );

    if (trackingCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO shipment_tracking (request_id, courier_type, status, updated_at)
         VALUES ($1, 'own_delivery', 'preparing', NOW())`,
        [requestId]
      );
    } else {
      await pool.query(
        `UPDATE shipment_tracking 
         SET status = 'preparing', updated_at = NOW()
         WHERE request_id = $1`,
        [requestId]
      );
    }

    await client.query("COMMIT");
    client.release();

    logger.info("Request accepted and passed to logistics", {
      request_id: requestId,
      employee_id: employeeId,
    });

    return res.json({
      success: true,
      message: "Request accepted and passed to logistics",
    });
  } catch (error) {
    logger.error("Accept request error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to accept request",
    });
  }
};
