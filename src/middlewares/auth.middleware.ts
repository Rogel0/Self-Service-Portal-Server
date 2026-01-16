import { Request, Response, NextFunction } from "express";
import { EmployeeTokenPayload, verifyToken } from "../utils/token";
import logger from "../utils/logger";

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      employee?: EmployeeTokenPayload;
    }
  }
}

// Verify JWT token for employees
export const employeeAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ success: false, message: "No token" });
  }
  try {
    req.employee = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Role-based access control
export const requireRole = (...allowedRoleIds: number[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.employee) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!allowedRoleIds.includes(req.employee.role_id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
      });
    }

    next();
  };
};
