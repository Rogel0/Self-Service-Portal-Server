import { Router, Request, Response } from "express";
import { verifyToken, verifyCustomerToken } from "../../utils/token";
import pool from "../../config/database";

const router = Router();

// GET /api/profile -> returns full employee or customer record based on token
router.get("/", async (req: Request, res: Response) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : undefined);
  if (!token)
    return res.status(401).json({ success: false, message: "No token" });

  try {
    const payload = verifyToken(token);
    // fetch employee by id
    const result = await pool.query(
      `SELECT employee_id, firstname, lastname, middlename, username, email, role_id, department_id
       FROM employee WHERE employee_id = $1 LIMIT 1`,
      [payload.employee_id],
    );
    const employee = result.rows[0];
    if (!employee)
      return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: { employee } });
  } catch {
    try {
      const payload = verifyCustomerToken(token);
      const result = await pool.query(
        `SELECT customer_id, first_name, last_name, username, email
         FROM customer_user WHERE customer_id = $1 LIMIT 1`,
        [payload.customer_id],
      );
      const customer = result.rows[0];
      if (!customer)
        return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true, data: { customer } });
    } catch {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
  }
});

export default router;
