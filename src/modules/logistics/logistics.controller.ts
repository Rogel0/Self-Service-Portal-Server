import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";

// Get all shipments for logistics
export const getShipments = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        st.tracking_id,
        st.request_id,
        st.courier_type,
        st.tracking_number,
        st.status,
        st.picked_up_at,
        st.delivered_at,
        st.updated_at,
        pr.customer_id,
        pr.total_amount,
        cu.first_name || ' ' || cu.last_name as customer_name,
        cu.email as customer_email,
        cu.phone as customer_phone,
        m.serial_number,
        m.model_number
       FROM shipment_tracking st
       JOIN parts_request pr ON st.request_id = pr.request_id
       JOIN customer_user cu ON pr.customer_id = cu.customer_id
       JOIN machines m ON pr.machine_id = m.machine_id
       ORDER BY st.updated_at DESC`
    );

    return res.json({
      success: true,
      data: { shipments: result.rows },
    });
  } catch (error) {
    logger.error("Get shipments error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch shipments",
    });
  }
};

// Update shipment status
export const updateShipmentStatus = async (req: Request, res: Response) => {
  const employeeId = req.employee?.employee_id;
  const { trackingId } = req.params;
  const { courier_type, status, tracking_number } = req.body;

  if (!employeeId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const client = await pool.connect();
    await client.query("BEGIN");

    // Get current tracking info
    const currentTracking = await pool.query(
      `SELECT request_id, courier_type FROM shipment_tracking WHERE tracking_id = $1`,
      [trackingId]
    );

    if (currentTracking.rows.length === 0) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    const finalCourierType = courier_type || currentTracking.rows[0].courier_type;
    const finalStatus = status;
    const pickedUpAt = status === "picked_up_by_courier" ? "NOW()" : null;
    const deliveredAt = status === "received" ? "NOW()" : null;

    // Update shipment tracking
    await pool.query(
      `UPDATE shipment_tracking 
       SET courier_type = $1,
           status = $2,
           tracking_number = COALESCE($3, tracking_number),
           picked_up_at = CASE WHEN $4 = true THEN NOW() ELSE picked_up_at END,
           delivered_at = CASE WHEN $5 = true THEN NOW() ELSE delivered_at END,
           updated_at = NOW()
       WHERE tracking_id = $6`,
      [
        finalCourierType,
        finalStatus,
        tracking_number || null,
        status === "picked_up_by_courier",
        status === "received",
        trackingId,
      ]
    );

    // Update parts request status based on tracking status
    let requestStatus = "preparing";
    if (status === "waiting_to_ship") {
      requestStatus = "waiting_to_ship";
    } else if (status === "shipping" || status === "picked_up_by_courier") {
      requestStatus = "shipping";
    } else if (status === "tracking_number_posted") {
      requestStatus = "shipping";
    } else if (status === "received") {
      requestStatus = "received";
    }

    await pool.query(
      `UPDATE parts_request 
       SET status = $1, updated_at = NOW()
       WHERE request_id = $2`,
      [requestStatus, currentTracking.rows[0].request_id]
    );

    await client.query("COMMIT");
    client.release();

    logger.info("Shipment status updated", {
      tracking_id: trackingId,
      employee_id: employeeId,
      status,
    });

    return res.json({
      success: true,
      message: "Shipment status updated successfully",
    });
  } catch (error) {
    logger.error("Update shipment status error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to update shipment status",
    });
  }
};
