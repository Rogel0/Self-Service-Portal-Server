import { Request, Response } from "express";
import * as employeeAuthService from "./employee-auth.service";
import logger from "../../../utils/logger";
import { getAuthCookieOptions } from "../../../utils/cookie";

// POST /api/auth/employee/login
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password, keepSignedIn } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Username and password are required",
        });
    }

    const result = await employeeAuthService.login({ username, password });

    if (!result.success) {
      return res.status(401).json(result);
    }

    // Set JWT as HTTP-only cookie; do not expose token in JSON body
    res.cookie(
      "token",
      result.data.token,
      getAuthCookieOptions(!!keepSignedIn)
    );

    res.json({
      success: true,
      message: "Login successful",
      data: { employee: result.data.employee },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
