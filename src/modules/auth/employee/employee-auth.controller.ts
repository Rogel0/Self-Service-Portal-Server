import { Request, Response } from "express";
import * as employeeAuthService from "./employee-auth.service";
import logger from "../../../utils/logger";
import {
  getAuthCookieOptions,
  getClearCookieOptions,
  getCookieConfig,
} from "../../../utils/cookie";
import pool from "../../../config/database";

// POST /api/auth/employee/login
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password, keepSignedIn } = req.body;

    if (!username || !password) {
      return res.status(400).json({
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
      getAuthCookieOptions(!!keepSignedIn),
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

export const logout = async (req: Request, res: Response) => {
  res.clearCookie("token", getClearCookieOptions());
  return res.json({ success: true, message: "Logged out" });
};

export const getMe = async (req: Request, res: Response) => {
  const userId = req.employee?.employee_id;
  const result = await pool.query(
    `SELECT e.employee_id, e.firstname, e.lastname, e.middlename, e.role_id, e.department_id,
            d.dept_name AS department, e.username, e.email, e.created_at, e.updated_at
     FROM employee e
     JOIN department d ON e.department_id = d.dept_id
     WHERE e.employee_id = $1
     LIMIT 1`,
    [userId],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  res.json({ success: true, data: { employee: result.rows[0] } });
};
