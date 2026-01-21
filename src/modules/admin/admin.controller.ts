import { Request, Response } from "express";
import pool from "../../config/database";
import { hashPassword } from "../../utils/hash";
import logger from "../../utils/logger";

// Get pending customer registrations
export const getPendingRegistrations = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        customer_id,
        first_name,
        last_name,
        middle_name,
        company_name,
        email,
        phone,
        landline,
        username,
        verification_status,
        approved,
        created_at
       FROM customer_user
       WHERE approved = false OR verification_status = 'pending'
       ORDER BY created_at DESC`
    );

    return res.json({
      success: true,
      data: { registrations: result.rows },
    });
  } catch (error) {
    logger.error("Get pending registrations error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending registrations",
    });
  }
};

// Approve customer registration
export const approveRegistration = async (req: Request, res: Response) => {
  const employeeId = req.employee?.employee_id;
  const { customerId } = req.params;
  const { approved, verification_status, rejectReason } = req.body;

  if (!employeeId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const client = await pool.connect();
    await client.query("BEGIN");

    if (approved) {
      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-12) + "A1!";
      const hashedPassword = await hashPassword(tempPassword);

      // Update customer
      await client.query(
        `UPDATE customer_user 
         SET approved = true, 
             verification_status = $1,
             verified_at = NOW(),
             verified_by = $2,
             password = $3,
             updated_at = NOW()
         WHERE customer_id = $4`,
        [verification_status || "approved", employeeId, hashedPassword, customerId]
      );

      // Get customer email for sending credentials
      const customerResult = await client.query(
        `SELECT email, username FROM customer_user WHERE customer_id = $1`,
        [customerId]
      );

      await client.query("COMMIT");
      client.release();

      // TODO: Send email with credentials
      logger.info("Registration approved", {
        customer_id: customerId,
        employee_id: employeeId,
        temp_password: tempPassword, // Remove in production, log securely
      });

      return res.json({
        success: true,
        message: "Registration approved successfully",
        data: {
          customer: customerResult.rows[0],
          temporary_password: tempPassword, // Remove in production
        },
      });
    } else {
      // Reject registration
      await client.query(
        `UPDATE customer_user 
         SET verification_status = 'rejected',
             verified_by = $1,
             verified_at = NOW(),
             updated_at = NOW()
         WHERE customer_id = $2`,
        [employeeId, customerId]
      );

      await client.query("COMMIT");
      client.release();

      logger.info("Registration rejected", {
        customer_id: customerId,
        employee_id: employeeId,
        reason: rejectReason,
      });

      return res.json({
        success: true,
        message: "Registration rejected",
      });
    }
  } catch (error) {
    logger.error("Approve registration error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to process registration",
    });
  }
};

// Get all parts requests (for admin)
export const getAllPartsRequests = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        pr.request_id,
        pr.customer_id,
        pr.machine_id,
        pr.status,
        pr.total_amount,
        pr.payment_verified,
        pr.call_verified,
        pr.created_at,
        pr.updated_at,
        cu.first_name || ' ' || cu.last_name as customer_name,
        cu.email as customer_email,
        m.serial_number,
        m.model_number
       FROM parts_request pr
       JOIN customer_user cu ON pr.customer_id = cu.customer_id
       JOIN machines m ON pr.machine_id = m.machine_id
       ORDER BY pr.created_at DESC`
    );

    return res.json({
      success: true,
      data: { requests: result.rows },
    });
  } catch (error) {
    logger.error("Get all parts requests error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch parts requests",
    });
  }
};

// Get all employees
export const getEmployees = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        e.employee_id,
        e.firstname,
        e.lastname,
        e.middlename,
        e.username,
        e.email,
        e.role_id,
        r.role_name,
        e.department_id,
        d.dept_name,
        e.created_at,
        e.updated_at
       FROM employee e
       LEFT JOIN roles r ON e.role_id = r.role_id
       LEFT JOIN department d ON e.department_id = d.dept_id
       ORDER BY e.created_at DESC`,
    );

    return res.json({ success: true, data: { employees: result.rows } });
  } catch (error) {
    logger.error("Get employees error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch employees" });
  }
};

// Get all customers
export const getCustomers = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        customer_id,
        first_name,
        last_name,
        middle_name,
        company_name,
        email,
        phone,
        landline,
        username,
        verification_status,
        approved,
        created_at,
        updated_at
       FROM customer_user
       ORDER BY created_at DESC`,
    );

    return res.json({ success: true, data: { customers: result.rows } });
  } catch (error) {
    logger.error("Get customers error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch customers" });
  }
};

// Get roles
export const getRoles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT role_id, role_name FROM roles ORDER BY role_name`,
    );
    return res.json({ success: true, data: { roles: result.rows } });
  } catch (error) {
    logger.error("Get roles error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch roles" });
  }
};

// Get departments
export const getDepartments = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT dept_id, dept_name FROM department ORDER BY dept_name`,
    );
    return res.json({ success: true, data: { departments: result.rows } });
  } catch (error) {
    logger.error("Get departments error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch departments" });
  }
};

// Create employee
export const createEmployee = async (req: Request, res: Response) => {
  const {
    firstname,
    lastname,
    middlename,
    username,
    email,
    role_id,
    department_id,
    password,
  } = req.body;

  try {
    const existing = await pool.query(
      `SELECT employee_id FROM employee WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)`,
      [username, email],
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Username or email already exists",
      });
    }

    const tempPassword =
      password?.toString() ?? Math.random().toString(36).slice(-12) + "A1!";
    const hashedPassword = await hashPassword(tempPassword);

    const result = await pool.query(
      `INSERT INTO employee
       (firstname, lastname, middlename, role_id, department_id, username, password, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING employee_id, firstname, lastname, middlename, username, email, role_id, department_id, created_at`,
      [
        firstname,
        lastname,
        middlename || null,
        role_id,
        department_id,
        username,
        hashedPassword,
        email,
      ],
    );

    logger.info("Employee created", { employee_id: result.rows[0].employee_id });

    return res.status(201).json({
      success: true,
      message: "Employee created successfully",
      data: {
        employee: result.rows[0],
        temporary_password: tempPassword,
      },
    });
  } catch (error) {
    logger.error("Create employee error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to create employee" });
  }
};

// Update employee
export const updateEmployee = async (req: Request, res: Response) => {
  const { employeeId } = req.params;
  const { firstname, lastname, middlename, email, role_id, department_id } =
    req.body;

  try {
    const result = await pool.query(
      `UPDATE employee
       SET firstname = COALESCE($1, firstname),
           lastname = COALESCE($2, lastname),
           middlename = COALESCE($3, middlename),
           email = COALESCE($4, email),
           role_id = COALESCE($5, role_id),
           department_id = COALESCE($6, department_id),
           updated_at = NOW()
       WHERE employee_id = $7
       RETURNING employee_id, firstname, lastname, middlename, username, email, role_id, department_id, updated_at`,
      [firstname, lastname, middlename, email, role_id, department_id, employeeId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    return res.json({
      success: true,
      message: "Employee updated successfully",
      data: { employee: result.rows[0] },
    });
  } catch (error) {
    logger.error("Update employee error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to update employee" });
  }
};
