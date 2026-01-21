import { Request, Response } from "express";
import pool from "../../../config/database";
import { hashPassword, comparePassword } from "../../../utils/hash";
import { generateCustomerToken } from "../../../utils/token";
import { getAuthCookieOptions } from "../../../utils/cookie";
import logger from "../../../utils/logger";

export const register = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      first_name,
      last_name,
      middle_name,
      company_name,
      email,
      phone,
      landline,
      username,
      password,
    } = req.body;

    // Check if username or email already exists
    const existingUser = await client.query(
      `SELECT customer_id FROM customer_user 
       WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)`,
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Username or email already exists",
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Insert customer with pending verification
    const result = await client.query(
      `INSERT INTO customer_user 
       (first_name, last_name, middle_name, company_name, email, phone, landline, username, password, verification_status, approved, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', false, NOW(), NOW())
       RETURNING customer_id, first_name, last_name, email, username, verification_status, approved, created_at`,
      [
        first_name,
        last_name,
        middle_name || null,
        company_name || null,
        email,
        phone,
        landline || null,
        username,
        hashedPassword,
      ]
    );

    await client.query("COMMIT");

    logger.info("Customer registered", { customer_id: result.rows[0].customer_id });

    return res.status(201).json({
      success: true,
      message: "Registration successful. Your account is pending verification.",
      data: { customer: result.rows[0] },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Registration error", { error });
    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
    });
  } finally {
    client.release();
  }
};

export const changePassword = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;
  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const { current_password, new_password } = req.body;

    // Get current password
    const result = await pool.query(
      `SELECT password FROM customer_user WHERE customer_id = $1`,
      [customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Verify current password
    const isValid = await comparePassword(
      current_password,
      result.rows[0].password
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(new_password);

    // Update password
    await pool.query(
      `UPDATE customer_user 
       SET password = $1, updated_at = NOW() 
       WHERE customer_id = $2`,
      [hashedPassword, customerId]
    );

    logger.info("Password changed", { customer_id: customerId });

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    logger.error("Change password error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to change password",
    });
  }
};
