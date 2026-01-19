import { Request, Response } from "express";
import pool from "../../../config/database";
import { comparePassword } from "../../../utils/hash";
import { generateCustomerToken } from "../../../utils/token";
import { getAuthCookieOptions, getCookieConfig } from "../../../utils/cookie";

export const login = async (req: Request, res: Response) => {
  const { username, password, keepSignedIn } = req.body;
  const result = await pool.query(
    `SELECT customer_id, first_name, last_name, username, password, email, verification_status, approved, created_at
     FROM customer_user
     WHERE lower(username) = lower($1) OR lower(email) = lower($1)
     LIMIT 1`,
    [username],
  );

  const customer = result.rows[0];
  if (!customer)
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });

  const ok = await comparePassword(password, customer.password);
  if (!ok)
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });

  if (!customer.approved) {
    return res
      .status(403)
      .json({ success: false, message: "Account not approved yet" });
  }

  if (customer.verification_status !== "approved") {
    return res
      .status(403)
      .json({ success: false, message: "Account not verified" });
  }

  const payload = {
    customer_id: customer.customer_id,
    username: customer.username,
    email: customer.email,
  };
  const token = generateCustomerToken(payload);

  res.cookie("token", token, getAuthCookieOptions(!!keepSignedIn));

  delete customer.password;
  return res.json({
    success: true,
    message: "Login successful",
    data: { customer },
  });
};

export const getMe = async (req: Request, res: Response) => {
  // `req.customer` set by customerAuth middleware
  const id = req.customer?.customer_id;
  if (!id)
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });

  const result = await pool.query(
    `SELECT customer_id, first_name, last_name, username, email, created_at
     FROM customer_user WHERE customer_id = $1 LIMIT 1`,
    [id],
  );
  if (!result.rows.length)
    return res.status(404).json({ success: false, message: "Not found" });

  return res.json({ success: true, data: { customer: result.rows[0] } });
};

export const logout = async (req: Request, res: Response) => {
  // clear cookie using base cookie config
  res.clearCookie("token", getCookieConfig());
  return res.json({ success: true, message: "Logged out successfully" });
};
