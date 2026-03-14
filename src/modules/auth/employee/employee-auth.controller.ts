import { Request, Response } from "express";
import * as employeeAuthService from "./employee-auth.service";
import logger from "../../../utils/logger";
import {
  getAuthCookieOptions,
  getClearCookieOptions,
  getCookieConfig,
} from "../../../utils/cookie";
import pool from "../../../config/database";
import { ensureEmployeeSecurityTables } from "./employee-security.service";
import { comparePassword, hashPassword } from "../../../utils/hash";

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
  await ensureEmployeeSecurityTables();
  const result = await pool.query(
    `SELECT e.employee_id, e.firstname, e.lastname, e.middlename, e.role_id, e.department_id,
            d.dept_name AS department, e.username, e.email, e.created_at, e.updated_at,
            COALESCE(ess.must_change_password, false) AS must_change_password
     FROM employee e
     JOIN department d ON e.department_id = d.dept_id
     LEFT JOIN employee_security_state ess ON e.employee_id = ess.employee_id
     WHERE e.employee_id = $1
     LIMIT 1`,
    [userId],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  res.json({ success: true, data: { employee: result.rows[0] } });
};

export const changePassword = async (req: Request, res: Response) => {
  const employeeId = req.employee?.employee_id;
  const { current_password, new_password } = req.body as {
    current_password: string;
    new_password: string;
  };

  if (!employeeId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters",
    });
  }

  let client;
  try {
    await ensureEmployeeSecurityTables();
    client = await pool.connect();
    await client.query("BEGIN");

    const employeeResult = await client.query(
      `SELECT employee_id, password FROM employee WHERE employee_id = $1 LIMIT 1`,
      [employeeId],
    );

    if (employeeResult.rows.length === 0) {
      await client.query("ROLLBACK");
      client.release();
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isValid = await comparePassword(
      current_password,
      employeeResult.rows[0].password,
    );
    if (!isValid) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const hashedPassword = await hashPassword(new_password);
    await client.query(
      `UPDATE employee SET password = $1, updated_at = NOW() WHERE employee_id = $2`,
      [hashedPassword, employeeId],
    );

    await client.query(
      `INSERT INTO employee_security_state (employee_id, must_change_password, updated_by_employee_id, updated_at)
       VALUES ($1, false, $1, NOW())
       ON CONFLICT (employee_id)
       DO UPDATE SET must_change_password = false,
                     updated_by_employee_id = EXCLUDED.updated_by_employee_id,
                     updated_at = NOW()`,
      [employeeId],
    );

    await client.query(
      `INSERT INTO employee_password_change_audit
       (employee_id, changed_by_employee_id, reason, force_change_on_login, created_at)
       VALUES ($1, $1, 'self_change', false, NOW())`,
      [employeeId],
    );

    await client.query("COMMIT");
    client.release();

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
    }
    logger.error("Employee change password error", {
      error,
      employee_id: employeeId,
    });
    return res.status(500).json({
      success: false,
      message: "Failed to change password",
    });
  }
};
