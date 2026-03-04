import { Request, Response, NextFunction } from "express";
import { CustomerTokenPayload, verifyCustomerToken } from "../utils/token";
import logger from "../utils/logger";

// Augment Express Request to include `customer`
declare module "express-serve-static-core" {
  interface Request {
    customer?: CustomerTokenPayload;
  }
}

export const customerAuth = (
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
      logger.info("CustomerAuth: no token provided", {
        path: req.path,
        method: req.method,
      });
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const payload = verifyCustomerToken(token);
    req.customer = payload;
    return next();
  } catch (err) {
    logger.warn("CustomerAuth: token invalid", {
      err: (err as Error).message,
      path: req.path,
    });
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};
