import { Router, Request, Response } from "express";
import * as employeeAuthService from "./employee/employee-auth.service";
import * as employeeController from "./employee/employee-auth.controller";
import pool from "../../config/database";
import { comparePassword } from "../../utils/hash";
import { generateCustomerToken } from "../../utils/token";
import { getAuthCookieOptions, getCookieConfig } from "../../utils/cookie";

const router = Router();

// Unified login: accepts { username, password, keepSignedIn, type? }
router.post("/login", async (req: Request, res: Response) => {
  const { username, password, keepSignedIn, type } = req.body;

  // If explicit type provided, delegate to the corresponding controller/service
  if (type === "employee") {
    return employeeController.login(req, res);
  }
  if (type === "customer") {
    // replicate customer controller login logic
    try {
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

      if (!customer.approved)
        return res
          .status(403)
          .json({ success: false, message: "Account not approved yet" });

      if (customer.verification_status !== "approved")
        return res
          .status(403)
          .json({ success: false, message: "Account not verified" });

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
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  // No explicit type: try employee login first, then customer
  try {
    const empResult = await employeeAuthService.login({ username, password });
    if (empResult.success) {
      // set cookie and respond
      res.cookie(
        "token",
        empResult.data.token,
        getAuthCookieOptions(!!keepSignedIn),
      );
      return res.json({
        success: true,
        message: "Login successful",
        data: { employee: empResult.data.employee },
      });
    }
  } catch {
    // ignore and try customer
  }

  // Try customer
  try {
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

    if (!customer.approved)
      return res
        .status(403)
        .json({ success: false, message: "Account not approved yet" });
    if (customer.verification_status !== "approved")
      return res
        .status(403)
        .json({ success: false, message: "Account not verified" });

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
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

// Unified logout: clear cookie
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("token", getCookieConfig());
  return res.json({ success: true, message: "Logged out" });
});

// Unified me: try employeeAuth middleware-like verification, then customer
import { verifyToken, verifyCustomerToken } from "../../utils/token";
router.get("/me", (req: Request, res: Response) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : undefined);
  if (!token)
    return res.status(401).json({ success: false, message: "No token" });
  try {
    const payload = verifyToken(token);
    if (!payload?.employee_id) {
      throw new Error("Not an employee token");
    }
    return pool
      .query(
        `SELECT e.employee_id, e.firstname, e.lastname, e.middlename, e.role_id, e.department_id,
                d.dept_name AS department, e.username, e.email, e.created_at, e.updated_at
         FROM employee e
         JOIN department d ON e.department_id = d.dept_id
         WHERE e.employee_id = $1
         LIMIT 1`,
        [payload.employee_id],
      )
      .then((result) => {
        if (!result.rows.length) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }
        return res.json({ success: true, data: { employee: result.rows[0] } });
      });
  } catch {
    try {
      const payload = verifyCustomerToken(token);
      return pool
        .query(
          `SELECT customer_id, first_name, last_name, middle_name, username, email, created_at
           FROM customer_user
           WHERE customer_id = $1
           LIMIT 1`,
          [payload.customer_id],
        )
        .then((result) => {
          if (!result.rows.length) {
            return res
              .status(404)
              .json({ success: false, message: "User not found" });
          }
          return res.json({ success: true, data: { customer: result.rows[0] } });
        });
    } catch {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
  }
});

export default router;
