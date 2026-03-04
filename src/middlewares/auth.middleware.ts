import { Request, Response, NextFunction } from "express";
import pool from "../config/database";
import {
  EmployeeTokenPayload,
  CustomerTokenPayload,
  verifyToken,
  verifyCustomerToken,
} from "../utils/token";
import logger from "../utils/logger";
import { success } from "zod";

// Augment Express Request to include `employee` and `customer` from our token payloads
declare module "express-serve-static-core" {
  interface Request {
    employee?: EmployeeTokenPayload;
    customer?: CustomerTokenPayload;
  }
}

export const employeeAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tokenFromCookie = req.cookies?.token;
    const header = req.headers.authorization;
    const tokenFromHeader = header?.startsWith("Bearer ")
      ? header.split(" ")[1]
      : undefined;
    const token = tokenFromCookie ?? tokenFromHeader;

    if (!token) {
      logger.info("Auth: no token provided", {
        path: req.path,
        method: req.method,
      });
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const payload = verifyToken(token); // throws on invalid/expired
    // minimal payload: { employee_id, role_id, department_id }
    req.employee = payload;
    return next();
  } catch (err) {
    logger.warn("Auth: token invalid", {
      err: (err as Error).message,
      path: req.path,
    });
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

export const requireRole = (...allowedRoleIds: number[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.employee) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }
    if (!allowedRoleIds.includes(req.employee.role_id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    return next();
  };
};

export const requirePermission = (permissionKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.employee) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    try {
      const result = await pool.query(
        `SELECT 
          ep.allowed AS employee_allowed,
          dp.allowed AS dept_allowed
         FROM employee e
         LEFT JOIN employee_permission ep
           ON e.employee_id = ep.employee_id
          AND ep.permission_key = $1
         LEFT JOIN department_permission dp
           ON e.department_id = dp.department_id
          AND dp.permission_key = $1
         WHERE e.employee_id = $2`,
        [permissionKey, req.employee.employee_id],
      );

      const row = result.rows[0];
      const allowed = row?.employee_allowed ?? row?.dept_allowed ?? false;

      if (!allowed) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      return next();
    } catch (err) {
      logger.error("Permission check failed", { err, permissionKey });
      return res.status(500).json({
        success: false,
        message: "Failed to verify permissions",
      });
    }
  };
};

export const requireAdminOrPermission = (permissionKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.employee) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    try {
      const result = await pool.query(
        `SELECT d.dept_name, ep.allowed AS employee_allowed, dp.allowed AS dept_allowed
         FROM employee e
         JOIN department d ON e.department_id = d.dept_id
         LEFT JOIN employee_permission ep
           ON e.employee_id = ep.employee_id AND ep.permission_key = $1
         LEFT JOIN department_permission dp
           ON e.department_id = dp.department_id AND dp.permission_key = $1
         WHERE e.employee_id = $2`,
         [permissionKey, req.employee.employee_id],
      );

      const row = result.rows[0];
      const isAdmin = row?.dept_name?.toLowerCase() === "admin";
      const allowed = row?.employee_allowed ?? row?.dept_allowed ?? false;

      if (isAdmin || allowed) {
        return next();
      }
      return res.status(403).json({ success: false, message: "Access denied" });
    } catch (err) {
      logger.error("Admin or permission check failed", { err, permissionKey });
      return res.status(500).json({
        success: false,
        message: "Failed to verify access"
      })
    }
  }
}

export const customerAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : undefined);
  if (!token)
    return res.status(401).json({ success: false, message: "No Token" });

  try {
    req.customer = verifyCustomerToken(token);
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid Token" });
  }
};
