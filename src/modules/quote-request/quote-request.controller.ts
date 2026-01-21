import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";

export const createQuoteRequest = async (req: Request, res: Response) => {
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

    const { items, notes } = req.body;

    // Calculate total
    let totalAmount = 0;
    const quoteItems = [];

    for (const item of items) {
      const partResult = await client.query(
        `SELECT parts_id, price FROM parts WHERE parts_id = $1`,
        [item.parts_id]
      );

      if (partResult.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(400).json({
          success: false,
          message: `Part with ID ${item.parts_id} not found`,
        });
      }

      const part = partResult.rows[0];
      const subtotal = parseFloat(part.price) * item.quantity;
      totalAmount += subtotal;

      quoteItems.push({
        parts_id: item.parts_id,
        quantity: item.quantity,
        unit_price: part.price,
        subtotal,
      });
    }

    // Create quote request
    const result = await client.query(
      `INSERT INTO quote_request 
       (customer_id, status, total_amount, notes, submitted_at)
       VALUES ($1, 'pending', $2, $3, NOW())
       RETURNING quote_id, customer_id, status, total_amount, notes, submitted_at`,
      [customerId, totalAmount, notes || null]
    );

    const quoteId = result.rows[0].quote_id;

    // Insert quote items
    for (const item of quoteItems) {
      await client.query(
        `INSERT INTO quote_items 
         (quote_id, parts_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [quoteId, item.parts_id, item.quantity, item.unit_price, item.subtotal]
      );
    }

    await client.query("COMMIT");
    client.release();

    // Get full quote details
    const fullQuote = await pool.query(
      `SELECT 
        qr.quote_id,
        qr.customer_id,
        qr.status,
        qr.total_amount,
        qr.notes,
        qr.submitted_at,
        json_agg(
          json_build_object(
            'item_id', qi.item_id,
            'parts_id', qi.parts_id,
            'quantity', qi.quantity,
            'unit_price', qi.unit_price,
            'subtotal', qi.subtotal,
            'parts_name', p.parts_name,
            'description', p.description
          )
        ) as items
       FROM quote_request qr
       JOIN quote_items qi ON qr.quote_id = qi.quote_id
       JOIN parts p ON qi.parts_id = p.parts_id
       WHERE qr.quote_id = $1
       GROUP BY qr.quote_id, qr.customer_id, qr.status, qr.total_amount, qr.notes, qr.submitted_at`,
      [quoteId]
    );

    logger.info("Quote request created", {
      quote_id: quoteId,
      customer_id: customerId,
    });

    return res.status(201).json({
      success: true,
      message: "Quote request created successfully",
      data: { quote: fullQuote.rows[0] },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    client.release();
    logger.error("Create quote request error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to create quote request",
    });
  }
};

export const getMyQuoteRequests = async (req: Request, res: Response) => {
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
        quote_id,
        status,
        total_amount,
        notes,
        submitted_at,
        approved_at
       FROM quote_request
       WHERE customer_id = $1
       ORDER BY submitted_at DESC`,
      [customerId]
    );

    return res.json({
      success: true,
      data: { quotes: result.rows },
    });
  } catch (error) {
    logger.error("Get quote requests error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quote requests",
    });
  }
};

export const getQuoteRequestDetails = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;
  const { quoteId } = req.params;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const result = await pool.query(
      `SELECT 
        qr.quote_id,
        qr.customer_id,
        qr.status,
        qr.total_amount,
        qr.notes,
        qr.submitted_at,
        qr.approved_at,
        json_agg(
          json_build_object(
            'item_id', qi.item_id,
            'parts_id', qi.parts_id,
            'quantity', qi.quantity,
            'unit_price', qi.unit_price,
            'subtotal', qi.subtotal,
            'parts_name', p.parts_name,
            'description', p.description
          )
        ) as items
       FROM quote_request qr
       JOIN quote_items qi ON qr.quote_id = qi.quote_id
       JOIN parts p ON qi.parts_id = p.parts_id
       WHERE qr.quote_id = $1 AND qr.customer_id = $2
       GROUP BY qr.quote_id, qr.customer_id, qr.status, qr.total_amount, qr.notes, qr.submitted_at, qr.approved_at`,
      [quoteId, customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Quote request not found",
      });
    }

    return res.json({
      success: true,
      data: { quote: result.rows[0] },
    });
  } catch (error) {
    logger.error("Get quote request details error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quote request details",
    });
  }
};

export const acceptQuote = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;
  const { quoteId } = req.params;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    // Verify quote belongs to customer and is pending
    const quoteCheck = await pool.query(
      `SELECT quote_id, status FROM quote_request 
       WHERE quote_id = $1 AND customer_id = $2`,
      [quoteId, customerId]
    );

    if (quoteCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Quote request not found",
      });
    }

    if (quoteCheck.rows[0].status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Quote request is not pending",
      });
    }

    // Update status to accepted
    await pool.query(
      `UPDATE quote_request 
       SET status = 'accepted', updated_at = NOW()
       WHERE quote_id = $1`,
      [quoteId]
    );

    logger.info("Quote accepted", { quote_id: quoteId });

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

// Admin/Sales: Get all quote requests
export const getAllQuoteRequests = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        qr.quote_id,
        qr.customer_id,
        qr.status,
        qr.total_amount,
        qr.notes,
        qr.submitted_at,
        qr.approved_at,
        cu.first_name || ' ' || cu.last_name as customer_name,
        cu.email as customer_email,
        cu.phone as customer_phone
       FROM quote_request qr
       JOIN customer_user cu ON qr.customer_id = cu.customer_id
       ORDER BY qr.submitted_at DESC`
    );

    return res.json({
      success: true,
      data: { quotes: result.rows },
    });
  } catch (error) {
    logger.error("Get all quote requests error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quote requests",
    });
  }
};

// Admin/Sales: Approve quote request
export const approveQuoteRequest = async (req: Request, res: Response) => {
  const employeeId = req.employee?.employee_id;
  const { quoteId } = req.params;
  const { approved, notes } = req.body;

  if (!employeeId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    if (approved) {
      await pool.query(
        `UPDATE quote_request 
         SET status = 'approved',
             approved_by = $1,
             approved_at = NOW(),
             notes = COALESCE($2, notes),
             updated_at = NOW()
         WHERE quote_id = $3`,
        [employeeId, notes, quoteId]
      );

      // Get customer email
      const customerResult = await pool.query(
        `SELECT cu.email, cu.first_name || ' ' || cu.last_name as customer_name
         FROM quote_request qr
         JOIN customer_user cu ON qr.customer_id = cu.customer_id
         WHERE qr.quote_id = $1`,
        [quoteId]
      );

      // TODO: Send email with approved quote

      logger.info("Quote request approved", {
        quote_id: quoteId,
        employee_id: employeeId,
      });

      return res.json({
        success: true,
        message: "Quote request approved successfully",
      });
    } else {
      await pool.query(
        `UPDATE quote_request 
         SET status = 'rejected',
             approved_by = $1,
             notes = COALESCE($2, notes),
             updated_at = NOW()
         WHERE quote_id = $3`,
        [employeeId, notes, quoteId]
      );

      logger.info("Quote request rejected", {
        quote_id: quoteId,
        employee_id: employeeId,
      });

      return res.json({
        success: true,
        message: "Quote request rejected",
      });
    }
  } catch (error) {
    logger.error("Approve quote request error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to process quote request",
    });
  }
};
