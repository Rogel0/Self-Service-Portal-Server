import { Request, Response, NextFunction } from "express";
import {
  EmployeeTokenPayload,
  CustomerTokenPayload,
  verifyToken,
  verifyCustomerToken,
} from "../utils/token";
import logger from "../utils/logger";

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
