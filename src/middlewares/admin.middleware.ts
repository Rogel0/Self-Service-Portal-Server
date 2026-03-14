import { Request, Response, NextFunction } from "express";

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.employee) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (req.employee.role_id !== 1) {
    return res.status(403).json({
      success: false,
      message: "Admin access only",
    });
  }

  next();
};
