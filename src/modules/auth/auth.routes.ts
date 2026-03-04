import { Router, Request, Response } from "express";
import * as employeeAuthService from "./employee/employee-auth.service";
import * as employeeController from "./employee/employee-auth.controller";
import pool from "../../config/database";
import { comparePassword } from "../../utils/hash";
import { generateCustomerToken, generateToken } from "../../utils/token";
import {
  getAuthCookieOptions,
  getClearCookieOptions,
  getCookieConfig,
} from "../../utils/cookie";
import { verifyToken, verifyCustomerToken } from "../../utils/token";
import { success } from "zod";
import logger from "../../utils/logger";
import { COOKIE_MAX_AGE } from "../../constants";

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

router.post("/refresh", (req: Request, res: Response) => {
  const token =
    req.cookies?.token || req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization?.split(" ")[1]
      : undefined;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token to refresh",
    });
  }

  try {
    const employeePayload = verifyToken(token);
    if (employeePayload?.employee_id) {
      const newToken = generateToken(employeePayload);
      res.cookie("token", newToken, {
        ...getCookieConfig(),
        maxAge: COOKIE_MAX_AGE.SHORT,
      });
      return res.json({
        success: true,
        message: "Token refreshed",
      });
    }
  } catch (error) {
    logger.error("Error refreshing employee token:", error);
  }

  try {
    const customerPayload = verifyCustomerToken(token);
    if (customerPayload?.customer_id) {
      const newToken = generateCustomerToken(customerPayload);
      res.cookie("token", newToken, {
        ...getCookieConfig(),
        maxAge: COOKIE_MAX_AGE.SHORT,
      });
      return res.json({
        success: true,
        message: "Token refreshed",
      });
    }
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }

  return res.status(401).json({
    success: false,
    message: "Invalid token format",
  });
});

// Unified logout: clear cookie
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("token", getClearCookieOptions());
  return res.json({ success: true, message: "Logged out" });
});

// Unified me: try employeeAuth middleware-like verification, then customer

router.get("/me", (req: Request, res: Response) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : undefined);
  if (!token) {
    res.clearCookie("token", getClearCookieOptions());
    return res.status(401).json({ success: false, message: "No token" });
  }
  try {
    const payload = verifyToken(token);
    if (!payload?.employee_id) {
      throw new Error("Not an employee token");
    }
    return pool
      .query(
        `SELECT e.employee_id, e.firstname, e.lastname, e.middlename, e.role_id, e.department_id,
                d.dept_name AS department, e.username, e.email, e.created_at, e.updated_at,
                COALESCE(ep_machines.allowed, dp_machines.allowed, false) AS machines_manage,
                COALESCE(ep_add.allowed, dp_add.allowed, false) AS machines_add,
                COALESCE(ep_manuals.allowed, dp_manuals.allowed, false) AS manuals_manage,
                COALESCE(ep_brochures.allowed, dp_brochures.allowed, false) AS brochures_manage,
                COALESCE(ep_products.allowed, dp_products.allowed, false) AS products_manage,
                COALESCE(ep_tracking.allowed, dp_tracking.allowed, false) AS tracking_manage,
                COALESCE(ep_accounts.allowed, dp_accounts.allowed, false) AS account_requests_manage,
                COALESCE(ep_parts.allowed, dp_parts.allowed, false) AS parts_requests_manage,
                COALESCE(ep_quotes.allowed, dp_quotes.allowed, false) AS quotes_manage,
                COALESCE(ep_customers.allowed, dp_customers.allowed, false) AS customers_manage,
                COALESCE(ep_permissions.allowed, dp_permissions.allowed, false) AS permissions_manage,
                COALESCE(ep_service.allowed, dp_service.allowed, false) AS service_requests_manage
         FROM employee e
         JOIN department d ON e.department_id = d.dept_id
         LEFT JOIN employee_permission ep_machines
           ON e.employee_id = ep_machines.employee_id AND ep_machines.permission_key = 'machines_manage'
         LEFT JOIN department_permission dp_machines
           ON e.department_id = dp_machines.department_id AND dp_machines.permission_key = 'machines_manage'
         LEFT JOIN employee_permission ep_add
           ON e.employee_id = ep_add.employee_id AND ep_add.permission_key = 'machines_add'
         LEFT JOIN department_permission dp_add
           ON e.department_id = dp_add.department_id AND dp_add.permission_key = 'machines_add'
         LEFT JOIN employee_permission ep_manuals
           ON e.employee_id = ep_manuals.employee_id AND ep_manuals.permission_key = 'manuals_manage'
         LEFT JOIN department_permission dp_manuals
           ON e.department_id = dp_manuals.department_id AND dp_manuals.permission_key = 'manuals_manage'
         LEFT JOIN employee_permission ep_brochures
           ON e.employee_id = ep_brochures.employee_id AND ep_brochures.permission_key = 'brochures_manage'
         LEFT JOIN department_permission dp_brochures
           ON e.department_id = dp_brochures.department_id AND dp_brochures.permission_key = 'brochures_manage'
         LEFT JOIN employee_permission ep_products
           ON e.employee_id = ep_products.employee_id AND ep_products.permission_key = 'products_manage'
         LEFT JOIN department_permission dp_products
           ON e.department_id = dp_products.department_id AND dp_products.permission_key = 'products_manage'
         LEFT JOIN employee_permission ep_tracking
           ON e.employee_id = ep_tracking.employee_id AND ep_tracking.permission_key = 'tracking_manage'
         LEFT JOIN department_permission dp_tracking
           ON e.department_id = dp_tracking.department_id AND dp_tracking.permission_key = 'tracking_manage'
         LEFT JOIN employee_permission ep_accounts
           ON e.employee_id = ep_accounts.employee_id AND ep_accounts.permission_key = 'account_requests_manage'
         LEFT JOIN department_permission dp_accounts
           ON e.department_id = dp_accounts.department_id AND dp_accounts.permission_key = 'account_requests_manage'
         LEFT JOIN employee_permission ep_parts
           ON e.employee_id = ep_parts.employee_id AND ep_parts.permission_key = 'parts_requests_manage'
         LEFT JOIN department_permission dp_parts
           ON e.department_id = dp_parts.department_id AND dp_parts.permission_key = 'parts_requests_manage'
         LEFT JOIN employee_permission ep_quotes
           ON e.employee_id = ep_quotes.employee_id AND ep_quotes.permission_key = 'quotes_manage'
         LEFT JOIN department_permission dp_quotes
           ON e.department_id = dp_quotes.department_id AND dp_quotes.permission_key = 'quotes_manage'
         LEFT JOIN employee_permission ep_customers
          ON e.employee_id = ep_customers.employee_id AND ep_customers.permission_key = 'customers_manage'
         LEFT JOIN department_permission dp_customers
          ON e.department_id = dp_customers.department_id AND dp_customers.permission_key = 'customers_manage'
         LEFT JOIN employee_permission ep_permissions
           ON e.employee_id = ep_permissions.employee_id AND ep_permissions.permission_key = 'permissions_manage'
         LEFT JOIN department_permission dp_permissions
           ON e.department_id = dp_permissions.department_id AND dp_permissions.permission_key = 'permissions_manage'
         LEFT JOIN employee_permission ep_service
           ON e.employee_id = ep_service.employee_id AND ep_service.permission_key = 'service_requests_manage'
         LEFT JOIN department_permission dp_service
           ON e.department_id = dp_service.department_id AND dp_service.permission_key = 'service_requests_manage'
         WHERE e.employee_id = $1
         LIMIT 1`,
        [payload.employee_id],
      )
      .then((result) => {
        if (!result.rows.length) {
          res.clearCookie("token", getClearCookieOptions());
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }
        return res.json({ success: true, data: { employee: result.rows[0] } });
      })
      .catch((err) => {
        logger.error("Database error in /me:", err);
        res.clearCookie("token", getClearCookieOptions());
        return res
          .status(500)
          .json({ success: false, message: "User not found" });
      });
  } catch (empError) {
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
          return res.json({
            success: true,
            data: { customer: result.rows[0] },
          });
        })
        .catch((err) => {
          logger.error("Database error in /me (customer):", err);
          res.clearCookie("token", getClearCookieOptions());
          return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
        });
    } catch (custError) {
      logger.warn("Invalid token in /me endpoint", {
        empError: (empError as Error).message,
        custError: (custError as Error).message,
      });
      res.clearCookie("token", getClearCookieOptions());
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
  }
});

export default router;
