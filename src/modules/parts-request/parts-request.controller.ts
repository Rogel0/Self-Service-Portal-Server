import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";

export const createPartsRequest = async (req: Request, res: Response) => {
  const client = await pool.connect();
  const customerId = req.customer?.customer_id;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    await client.query("BEGIN");

    const { machine_id, items, notes } = req.body;

    // Verify machine belongs to customer
    const machineCheck = await client.query(
      `SELECT machine_id FROM machines WHERE machine_id = $1 AND customer_id = $2`,
      [machine_id, customerId]
    );

    if (machineCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Machine not found",
      });
    }

    // Calculate total and validate parts
    let totalAmount = 0;
    const requestItems = [];

    for (const item of items) {
      const partResult = await client.query(
        `SELECT parts_id, price, stock_quantity FROM parts WHERE parts_id = $1`,
        [item.parts_id]
      );

      if (partResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `Part with ID ${item.parts_id} not found`,
        });
      }

      const part = partResult.rows[0];
      if (part.stock_quantity < item.quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for part ${part.parts_id}. Available: ${part.stock_quantity}, Requested: ${item.quantity}`,
        });
      }

      const subtotal = parseFloat(part.price) * item.quantity;
      totalAmount += subtotal;

      requestItems.push({
        parts_id: item.parts_id,
        quantity: item.quantity,
        unit_price: part.price,
        subtotal,
      });
    }

    // Create parts request
    const requestResult = await client.query(
      `INSERT INTO parts_request 
       (customer_id, machine_id, status, total_amount, notes, created_at, updated_at)
       VALUES ($1, $2, 'pending', $3, $4, NOW(), NOW())
       RETURNING request_id, customer_id, machine_id, status, total_amount, notes, created_at`,
      [customerId, machine_id, totalAmount, notes || null]
    );

    const requestId = requestResult.rows[0].request_id;

    // Insert request items
    for (const item of requestItems) {
      await client.query(
        `INSERT INTO parts_request_items 
         (request_id, parts_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [requestId, item.parts_id, item.quantity, item.unit_price, item.subtotal]
      );
    }

    await client.query("COMMIT");

    // Get full request details
    const fullRequest = await pool.query(
      `SELECT 
        pr.request_id,
        pr.customer_id,
        pr.machine_id,
        pr.status,
        pr.total_amount,
        pr.notes,
        pr.created_at,
        pr.updated_at,
        m.serial_number,
        m.model_number,
        json_agg(
          json_build_object(
            'item_id', pri.item_id,
            'parts_id', pri.parts_id,
            'quantity', pri.quantity,
            'unit_price', pri.unit_price,
            'subtotal', pri.subtotal,
            'parts_name', p.parts_name
          )
        ) as items
       FROM parts_request pr
       JOIN machines m ON pr.machine_id = m.machine_id
       JOIN parts_request_items pri ON pr.request_id = pri.request_id
       JOIN parts p ON pri.parts_id = p.parts_id
       WHERE pr.request_id = $1
       GROUP BY pr.request_id, pr.customer_id, pr.machine_id, pr.status, pr.total_amount, pr.notes, pr.created_at, pr.updated_at, m.serial_number, m.model_number`,
      [requestId]
    );

    logger.info("Parts request created", {
      request_id: requestId,
      customer_id: customerId,
    });

    return res.status(201).json({
      success: true,
      message: "Parts request created successfully",
      data: { request: fullRequest.rows[0] },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Create parts request error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to create parts request",
    });
  } finally {
    client.release();
  }
};

export const getMyPartsRequests = async (req: Request, res: Response) => {
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
        pr.request_id,
        pr.machine_id,
        pr.status,
        pr.total_amount,
        pr.payment_verified,
        pr.created_at,
        pr.updated_at,
        m.serial_number,
        m.model_number,
        st.tracking_number,
        st.courier_type,
        st.status as tracking_status
       FROM parts_request pr
       JOIN machines m ON pr.machine_id = m.machine_id
       LEFT JOIN shipment_tracking st ON pr.request_id = st.request_id
       WHERE pr.customer_id = $1
       ORDER BY pr.created_at DESC`,
      [customerId]
    );

    return res.json({
      success: true,
      data: { requests: result.rows },
    });
  } catch (error) {
    logger.error("Get parts requests error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch parts requests",
    });
  }
};

export const getPartsRequestDetails = async (req: Request, res: Response) => {
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
        m.serial_number,
        m.model_number,
        st.tracking_id,
        st.courier_type,
        st.tracking_number,
        st.status as tracking_status,
        st.picked_up_at,
        st.delivered_at,
        st.updated_at as tracking_updated_at,
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
       JOIN machines m ON pr.machine_id = m.machine_id
       LEFT JOIN shipment_tracking st ON pr.request_id = st.request_id
       JOIN parts_request_items pri ON pr.request_id = pri.request_id
       JOIN parts p ON pri.parts_id = p.parts_id
       WHERE pr.request_id = $1 AND pr.customer_id = $2
       GROUP BY pr.request_id, pr.customer_id, pr.machine_id, pr.status, pr.total_amount, 
                pr.payment_verified, pr.payment_proof_url, pr.call_verified, pr.call_verified_at,
                pr.notes, pr.created_at, pr.updated_at, m.serial_number, m.model_number,
                st.tracking_id, st.courier_type, st.tracking_number, st.status, st.picked_up_at,
                st.delivered_at, st.updated_at`,
      [requestId, customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Parts request not found",
      });
    }

    return res.json({
      success: true,
      data: { request: result.rows[0] },
    });
  } catch (error) {
    logger.error("Get parts request details error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch parts request details",
    });
  }
};

export const acceptQuote = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;
  const { requestId } = req.params;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    // Verify request belongs to customer and is in quote_sent status
    const requestCheck = await pool.query(
      `SELECT request_id, status FROM parts_request 
       WHERE request_id = $1 AND customer_id = $2`,
      [requestId, customerId]
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Parts request not found",
      });
    }

    if (requestCheck.rows[0].status !== "quote_sent") {
      return res.status(400).json({
        success: false,
        message: "Quote has not been sent yet",
      });
    }

    // Update status to quote_accepted
    await pool.query(
      `UPDATE parts_request 
       SET status = 'quote_accepted', updated_at = NOW()
       WHERE request_id = $1`,
      [requestId]
    );

    logger.info("Quote accepted", { request_id: requestId });

    return res.json({
      success: true,
      message: "Quote accepted successfully",
    });
  } catch (error) {
    logger.error("Accept quote error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to accept quote",
    });
  }
};

export const uploadPaymentProof = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;
  const { requestId } = req.params;
  const { payment_proof_url } = req.body;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    // Verify request belongs to customer
    const requestCheck = await pool.query(
      `SELECT request_id, status FROM parts_request 
       WHERE request_id = $1 AND customer_id = $2`,
      [requestId, customerId]
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Parts request not found",
      });
    }

    // Update payment proof URL and status
    await pool.query(
      `UPDATE parts_request 
       SET payment_proof_url = $1, status = 'payment_pending', updated_at = NOW()
       WHERE request_id = $2`,
      [payment_proof_url, requestId]
    );

    logger.info("Payment proof uploaded", { request_id: requestId });

    return res.json({
      success: true,
      message: "Payment proof uploaded successfully",
    });
  } catch (error) {
    logger.error("Upload payment proof error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to upload payment proof",
    });
  }
};
