import { Request, Response } from "express";
import pool from "../../config/database";
import { hashPassword } from "../../utils/hash";
import logger from "../../utils/logger";
import { supabase } from "../../utils/supabase";
import { success } from "zod";
import * as storage from "../../services/storage";
import { computeWarrantyInfo } from "../../utils/warranty";

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
        initial_product_id,
        initial_product_name,
        initial_model_number,
        initial_serial_number,
        initial_purchase_date,
        verification_status,
        approved,
        created_at
       FROM customer_user
       WHERE approved = false OR verification_status = 'pending'
       ORDER BY created_at DESC`,
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

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    if (approved) {
      const registrationResult = await client.query(
        `SELECT initial_product_id,
                initial_product_name,
                initial_model_number,
                initial_serial_number,
                initial_purchase_date
         FROM customer_user
         WHERE customer_id = $1`,
        [customerId],
      );

      if (registrationResult.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(404).json({
          success: false,
          message: "Customer registration not found",
        });
      }

      const registration = registrationResult.rows[0];
      let productId: number | null = null;

      if (registration.initial_product_id) {
        const productResult = await client.query(
          `SELECT product_id
           FROM product
           WHERE product_id = $1
           LIMIT 1`,
          [registration.initial_product_id],
        );
        if (productResult.rows.length === 0) {
          await client.query("ROLLBACK");
          client.release();
          return res.status(400).json({
            success: false,
            message: "Selected product no longer exists",
          });
        }
        productId = productResult.rows[0].product_id;
      } else if (registration.initial_product_name) {
        const productResult = await client.query(
          `SELECT product_id
           FROM product
           WHERE product_name = $1
           LIMIT 1`,
          [registration.initial_product_name],
        );
        if (productResult.rows.length === 0) {
          await client.query("ROLLBACK");
          client.release();
          return res.status(400).json({
            success: false,
            message: "Selected product no longer exists",
          });
        }
        productId = productResult.rows[0].product_id;
      } else {
        await client.query("ROLLBACK");
        client.release();
        return res.status(400).json({
          success: false,
          message: "No product selected for registration",
        });
      }

      await client.query(
        `INSERT INTO machines
        (customer_id, product_id, serial_number, model_number, purchase_date, registration_date, status, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), 'active', NOW())`,
        [
          customerId,
          productId,
          registration.initial_serial_number,
          registration.initial_model_number,
          registration.initial_purchase_date || null,
        ],
      );

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
        [
          verification_status || "approved",
          employeeId,
          hashedPassword,
          customerId,
        ],
      );

      // Get customer email for sending credentials
      const customerResult = await client.query(
        `SELECT email, username FROM customer_user WHERE customer_id = $1`,
        [customerId],
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
        [employeeId, customerId],
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
    if (client) {
      await client.query("ROLLBACK");
      client.release();
    }
    logger.error("Approve registration error", { error });
    if ((error as any)?.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Serial number already exists",
      });
    }
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
       ORDER BY pr.created_at DESC`,
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
        e.updated_at,
        COALESCE(ep_machines.allowed, dp_machines.allowed, false) AS machines_manage,
        CASE
          WHEN ep_machines.allowed IS NOT NULL THEN 'override'
          WHEN dp_machines.allowed IS NOT NULL THEN 'department'
          ELSE 'none'
        END AS machines_manage_source,
        COALESCE(ep_add.allowed, dp_add.allowed, false) AS machines_add,
        CASE
          WHEN ep_add.allowed IS NOT NULL THEN 'override'
          WHEN dp_add.allowed IS NOT NULL THEN 'department'
          ELSE 'none'
        END AS machines_add_source,
        COALESCE(ep_manuals.allowed, dp_manuals.allowed, false) AS manuals_manage,
        CASE
          WHEN ep_manuals.allowed IS NOT NULL THEN 'override'
          WHEN dp_manuals.allowed IS NOT NULL THEN 'department'
          ELSE 'none'
        END AS manuals_manage_source,
        COALESCE(ep_brochures.allowed, dp_brochures.allowed, false) AS brochures_manage,
        CASE
          WHEN ep_brochures.allowed IS NOT NULL THEN 'override'
          WHEN dp_brochures.allowed IS NOT NULL THEN 'department'
          ELSE 'none'
        END AS brochures_manage_source,
        COALESCE(ep_products.allowed, dp_products.allowed, false) AS products_manage,
        CASE
          WHEN ep_products.allowed IS NOT NULL THEN 'override'
          WHEN dp_products.allowed IS NOT NULL THEN 'department'
          ELSE 'none'
        END AS products_manage_source,
        COALESCE(ep_tracking.allowed, dp_tracking.allowed, false) AS tracking_manage,
        CASE
          WHEN ep_tracking.allowed IS NOT NULL THEN 'override'
          WHEN dp_tracking.allowed IS NOT NULL THEN 'department'
          ELSE 'none'
        END AS tracking_manage_source,
        COALESCE(ep_accounts.allowed, dp_accounts.allowed, false) AS account_requests_manage,
        CASE
          WHEN ep_accounts.allowed IS NOT NULL THEN 'override'
          WHEN dp_accounts.allowed IS NOT NULL THEN 'department'
          ELSE 'none'
        END AS account_requests_manage_source,
        COALESCE(ep_parts.allowed, dp_parts.allowed, false) AS parts_requests_manage,
        CASE
          WHEN ep_parts.allowed IS NOT NULL THEN 'override'
          WHEN dp_parts.allowed IS NOT NULL THEN 'department'
          ELSE 'none'
        END AS parts_requests_manage_source,
        COALESCE(ep_quotes.allowed, dp_quotes.allowed, false) AS quotes_manage,
        CASE
          WHEN ep_quotes.allowed IS NOT NULL THEN 'override'
          WHEN dp_quotes.allowed IS NOT NULL THEN 'department'
          ELSE 'none'
        END AS quotes_manage_source,
        COALESCE(ep_customers.allowed, dp_customers.allowed, false) AS customers_manage,
        CASE WHEN ep_customers.allowed IS NOT NULL THEN 'override' WHEN dp_customers.allowed IS NOT NULL THEN 'department' ELSE 'none' END AS customers_manage_source,
        COALESCE(ep_permissions.allowed, dp_permissions.allowed, false) AS permissions_manage,
        CASE WHEN ep_permissions.allowed IS NOT NULL THEN 'override' WHEN dp_permissions.allowed IS NOT NULL THEN 'department' ELSE 'none' END AS permissions_manage_source
       FROM employee e
       LEFT JOIN roles r ON e.role_id = r.role_id
       LEFT JOIN department d ON e.department_id = d.dept_id
       LEFT JOIN employee_permission ep_machines
         ON e.employee_id = ep_machines.employee_id
        AND ep_machines.permission_key = 'machines_manage'
       LEFT JOIN department_permission dp_machines
         ON e.department_id = dp_machines.department_id
        AND dp_machines.permission_key = 'machines_manage'
       LEFT JOIN employee_permission ep_add
         ON e.employee_id = ep_add.employee_id
        AND ep_add.permission_key = 'machines_add'
       LEFT JOIN department_permission dp_add
         ON e.department_id = dp_add.department_id
        AND dp_add.permission_key = 'machines_add'
       LEFT JOIN employee_permission ep_manuals
         ON e.employee_id = ep_manuals.employee_id
        AND ep_manuals.permission_key = 'manuals_manage'
       LEFT JOIN department_permission dp_manuals
         ON e.department_id = dp_manuals.department_id
        AND dp_manuals.permission_key = 'manuals_manage'
       LEFT JOIN employee_permission ep_brochures
         ON e.employee_id = ep_brochures.employee_id
        AND ep_brochures.permission_key = 'brochures_manage'
       LEFT JOIN department_permission dp_brochures
         ON e.department_id = dp_brochures.department_id
        AND dp_brochures.permission_key = 'brochures_manage'
       LEFT JOIN employee_permission ep_products
         ON e.employee_id = ep_products.employee_id
        AND ep_products.permission_key = 'products_manage'
       LEFT JOIN department_permission dp_products
         ON e.department_id = dp_products.department_id
        AND dp_products.permission_key = 'products_manage'
       LEFT JOIN employee_permission ep_tracking
         ON e.employee_id = ep_tracking.employee_id
        AND ep_tracking.permission_key = 'tracking_manage'
       LEFT JOIN department_permission dp_tracking
         ON e.department_id = dp_tracking.department_id
        AND dp_tracking.permission_key = 'tracking_manage'
       LEFT JOIN employee_permission ep_accounts
         ON e.employee_id = ep_accounts.employee_id
        AND ep_accounts.permission_key = 'account_requests_manage'
       LEFT JOIN department_permission dp_accounts
         ON e.department_id = dp_accounts.department_id
        AND dp_accounts.permission_key = 'account_requests_manage'
       LEFT JOIN employee_permission ep_parts
         ON e.employee_id = ep_parts.employee_id
        AND ep_parts.permission_key = 'parts_requests_manage'
       LEFT JOIN department_permission dp_parts
         ON e.department_id = dp_parts.department_id
        AND dp_parts.permission_key = 'parts_requests_manage'
       LEFT JOIN employee_permission ep_quotes
         ON e.employee_id = ep_quotes.employee_id
        AND ep_quotes.permission_key = 'quotes_manage'
       LEFT JOIN department_permission dp_quotes
         ON e.department_id = dp_quotes.department_id
        AND dp_quotes.permission_key = 'quotes_manage'
       LEFT JOIN employee_permission ep_customers
        ON e.employee_id = ep_customers.employee_id
        AND ep_customers.permission_key = 'customers_manage'
       LEFT JOIN department_permission dp_customers
        ON e.department_id = dp_customers.department_id
        AND dp_customers.permission_key = 'customers_manage'
       LEFT JOIN employee_permission ep_permissions
        ON e.employee_id = ep_permissions.employee_id
        AND ep_permissions.permission_key = 'permissions_manage'
       LEFT JOIN department_permission dp_permissions
        ON e.department_id = dp_permissions.department_id
        AND dp_permissions.permission_key = 'permissions_manage'
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

export const updateEmployeePermission = async (req: Request, res: Response) => {
  const { employeeId } = req.params;
  const { permission_key, allowed } = req.body as {
    permission_key:
      | "machines_manage"
      | "machines_add"
      | "manuals_manage"
      | "brochures_manage"
      | "products_manage"
      | "tracking_manage"
      | "account_requests_manage"
      | "parts_requests_manage"
      | "quotes_manage"
      | "customers_manage"
      | "permissions_manage";
    allowed: boolean;
  };

  try {
    const employeeResult = await pool.query(
      `SELECT employee_id FROM employee WHERE employee_id = $1`,
      [employeeId],
    );

    if (employeeResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    const result = await pool.query(
      `INSERT INTO employee_permission (employee_id, permission_key, allowed, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (employee_id, permission_key)
       DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = NOW()
       RETURNING employee_id, permission_key, allowed`,
      [employeeId, permission_key, allowed],
    );

    return res.json({
      success: true,
      message: "Permission updated",
      data: { permission: result.rows[0] },
    });
  } catch (error) {
    logger.error("Update employee permission error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to update permission" });
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

// Get one customer by ID
export const getCustomerById = async (req: Request, res: Response) => {
  try {
    const raw = req.params.customerId;
    const customerId = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

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
       WHERE customer_id = $1`,
      [customerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.json({
      success: true,
      data: { customer: result.rows[0] },
    });
  } catch (error) {
    logger.error("Get customer by ID error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch customer" });
  }
};

// Get machines for a customer
export const getCustomerMachines = async (req: Request, res: Response) => {
  try {
    const raw = req.params.customerId;
    const customerId = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    const result = await pool.query(
      `SELECT 
        m.machine_id,
        m.serial_number,
        m.model_number,
        m.product_id,
        p.product_name,
        m.customer_id,
        m.purchase_date,
        m.status,
        m.created_at
       FROM machines m
       LEFT JOIN product p ON m.product_id = p.product_id
       WHERE m.customer_id = $1
       ORDER BY m.created_at DESC`,
      [customerId],
    );

    const machines = result.rows.map((row) => ({
      ...row,
      ...computeWarrantyInfo(row.purchase_date),
    }));

    return res.json({ success: true, data: { machines } });
  } catch (error) {
    logger.error("Get customer machines error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch customer machines" });
  }
};

export const getCustomerPartsRequests = async (req: Request, res: Response) => {
  try {
    const raw = req.params.customerId;
    const customerId = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }
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
        m.serial_number,
        m.model_number
       FROM parts_request pr
       JOIN machines m ON pr.machine_id = m.machine_id
       WHERE pr.customer_id = $1
       ORDER BY pr.created_at DESC`,
      [customerId],
    );
    return res.json({ success: true, data: { requests: result.rows } });
  } catch (error) {
    logger.error("Get customer history error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer parts requests",
    });
  }
};

// Assign a machine to a customer (admin)
export const assignMachineToCustomer = async (req: Request, res: Response) => {
  try {
    const raw = req.params.customerId;
    const customerId = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    const { product_id, serial_number, model_number, purchase_date } = req.body;

    if (
      !serial_number ||
      typeof serial_number !== "string" ||
      !serial_number.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Serial number is required",
      });
    }

    const productId =
      product_id != null ? parseInt(String(product_id), 10) : null;
    if (productId == null || isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: "Product is required",
      });
    }

    // Verify customer exists
    const customerCheck = await pool.query(
      `SELECT customer_id FROM customer_user WHERE customer_id = $1`,
      [customerId],
    );
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Verify product exists
    const productCheck = await pool.query(
      `SELECT product_id, product_name FROM product WHERE product_id = $1`,
      [productId],
    );
    if (productCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid product",
      });
    }

    const result = await pool.query(
      `INSERT INTO machines
       (customer_id, product_id, serial_number, model_number, purchase_date, registration_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'active', NOW())
       RETURNING machine_id, serial_number, model_number, product_id, customer_id, purchase_date, status, created_at`,
      [
        customerId,
        productId,
        serial_number.trim(),
        model_number != null && String(model_number).trim() !== ""
          ? String(model_number).trim()
          : null,
        purchase_date && String(purchase_date).trim() !== ""
          ? String(purchase_date).trim()
          : null,
      ],
    );

    const row = result.rows[0];
    const machine = {
      ...row,
      product_name: productCheck.rows[0].product_name,
      ...computeWarrantyInfo(row.purchase_date),
    };

    logger.info("Machine assigned to customer", {
      machine_id: row.machine_id,
      customer_id: customerId,
    });

    return res.status(201).json({
      success: true,
      data: { machine },
    });
  } catch (error: any) {
    logger.error("Assign machine to customer error", { error });
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Serial number already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to assign machine to customer",
    });
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

const sanitizeFilename = (name: string) =>
  name.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");

const getManualUrl = async (fileUrlOrPath: string) => {
  if (fileUrlOrPath.startsWith("http")) return fileUrlOrPath;
  const { data, error } = await supabase.storage
    .from("manuals")
    .createSignedUrl(fileUrlOrPath, 60 * 10);
  if (error) {
    const { data: publicUrl } = supabase.storage
      .from("manuals")
      .getPublicUrl(fileUrlOrPath);
    return publicUrl.publicUrl;
  }
  return data.signedUrl;
};

const getBrochureUrl = async (fileUrlOrPath: string) => {
  if (fileUrlOrPath.startsWith("http")) return fileUrlOrPath;
  const { data, error } = await supabase.storage
    .from("brochures")
    .createSignedUrl(fileUrlOrPath, 60 * 10);
  if (error) {
    const { data: publicUrl } = supabase.storage
      .from("brochures")
      .getPublicUrl(fileUrlOrPath);
    return publicUrl.publicUrl;
  }
  return data.signedUrl;
};

const getProductImageUrl = async (fileUrlOrPath: string) => {
  if (fileUrlOrPath.startsWith("http")) return fileUrlOrPath;
  const { data, error } = await supabase.storage
    .from("products")
    .createSignedUrl(fileUrlOrPath, 60 * 10);
  if (error) {
    const { data: publicUrl } = supabase.storage
      .from("products")
      .getPublicUrl(fileUrlOrPath);
    return publicUrl.publicUrl;
  }
  return data.signedUrl;
};

export const uploadManualFile = async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  try {
    const fileName = sanitizeFilename(file.originalname);
    const filePath = `${Date.now()}-${fileName}`;
    const title = file.originalname.replace(/\.[^.]+$/, "");
    let savedPath: string;

    try {
      const result = await storage.upload("manuals", filePath, file.buffer, {
        contentType: file.mimetype,
      });
      savedPath = result.path;
    } catch (error) {
      logger.error("Upload manual error", { error });
      return res.status(500).json({
        success: false,
        message: "Failed to upload manual",
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO machine_manuals (machine_id, product_id, title, file_url, uploaded_at)
       VALUES (NULL, NULL, $1, $2, NOW())
       RETURNING manual_id, title, file_url, uploaded_at, product_id`,
      [title, savedPath],
    );
    const manualRow = insertResult.rows[0];
    const url = await storage.resolveUrl("manuals", manualRow.file_url);

    return res.json({
      success: true,
      data: {
        manual: {
          ...manualRow,
          url,
        },
      },
    });
  } catch (error) {
    logger.error("Upload manual error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to upload manual",
    });
  }
};

export const getManuals = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT manual_id, title, file_url, uploaded_at, machine_id, product_id
       FROM machine_manuals
       ORDER BY uploaded_at DESC`,
    );

    const manuals = await Promise.all(
      result.rows.map(async (row) => ({
        ...row,
        url: await storage.resolveUrl("manuals", row.file_url),
      })),
    );

    return res.json({ success: true, data: { manuals } });
  } catch (error) {
    logger.error("Get manuals error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch manuals",
    });
  }
};

export const uploadBrochureFile = async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  try {
    const fileName = sanitizeFilename(file.originalname);
    const filePath = `${Date.now()}-${fileName}`;
    const title = file.originalname.replace(/\.[^.]+$/, "");

    let savedPath: string;
    try {
      const result = await storage.upload("brochures", filePath, file.buffer, {
        contentType: file.mimetype,
      });
      savedPath = result.path;
    } catch (error) {
      logger.error("Upload brochure error", { error });
      return res.status(500).json({
        success: false,
        message: "Failed to upload brochure",
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO machine_brochures (machine_id, product_id, title, file_url, uploaded_at)
       VALUES (NULL, NULL, $1, $2, NOW())
       RETURNING brochure_id, title, file_url, uploaded_at, product_id`,
      [title, savedPath],
    );
    const brochureRow = insertResult.rows[0];
    const url = await storage.resolveUrl("brochures", brochureRow.file_url);

    return res.json({
      success: true,
      data: {
        brochure: {
          ...brochureRow,
          url,
        },
      },
    });
  } catch (error) {
    logger.error("Upload brochure error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to upload brochure",
    });
  }
};

export const getBrochures = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT brochure_id, title, file_url, uploaded_at, machine_id, product_id
       FROM machine_brochures
       ORDER BY uploaded_at DESC`,
    );

    const brochures = await Promise.all(
      result.rows.map(async (row) => ({
        ...row,
        url: await storage.resolveUrl("brochures", row.file_url),
      })),
    );

    return res.json({ success: true, data: { brochures } });
  } catch (error) {
    logger.error("Get brochures error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch brochures",
    });
  }
};

export const uploadProductProfileImage = async (
  req: Request,
  res: Response,
) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  try {
    const fileName = sanitizeFilename(file.originalname);
    const filePath = `${Date.now()}-${fileName}`;

    let savedPath: string;
    try {
      const result = await storage.upload("products", filePath, file.buffer, {
        contentType: file.mimetype,
      });
      savedPath = result.path;
    } catch (error) {
      logger.error("Upload product image error", { error });
      return res.status(500).json({
        success: false,
        message: "Failed to upload product image",
      });
    }

    const url = await storage.resolveUrl("products", savedPath);
    return res.json({
      success: true,
      data: {
        image: {
          file_url: savedPath,
          url,
        },
      },
    });
  } catch (error) {
    logger.error("Upload product image error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to upload product image",
    });
  }
};

// Get all machines (admin)
export const getMachines = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        m.machine_id,
        m.serial_number,
        m.model_number,
        m.product_id,
        p.product_name,
        m.customer_id,
        COALESCE(cu.first_name || ' ' || cu.last_name, '') AS customer_name,
        m.status,
        m.created_at
       FROM machines m
       LEFT JOIN product p ON m.product_id = p.product_id
       LEFT JOIN customer_user cu ON m.customer_id = cu.customer_id
       ORDER BY m.created_at DESC`,
    );
    return res.json({ success: true, data: { machines: result.rows } });
  } catch (error) {
    logger.error("Get machines error", { error });
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch machines" });
  }
};

// Product file uploads
export const uploadProductManual = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const file = (req as Request & { file?: Express.Multer.File }).file;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "Product ID is required",
    });
  }

  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  try {
    const fileName = sanitizeFilename(file.originalname);
    const filePath = `${Date.now()}-${fileName}`;
    const title = req.body.title || file.originalname.replace(/\.[^.]+$/, "");
    let savedPath: string;

    try {
      const result = await storage.upload("manuals", filePath, file.buffer, {
        contentType: file.mimetype,
      });
      savedPath = result.path;
    } catch (error) {
      logger.error("Upload product manual error", { error });
      return res.status(500).json({
        success: false,
        message: "Failed to upload manual",
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO machine_manuals (machine_id, product_id, title, file_url, uploaded_at)
       VALUES (NULL, $1, $2, $3, NOW())
       RETURNING manual_id, title, file_url, uploaded_at, product_id`,
      [productId, title, savedPath],
    );
    const manualRow = insertResult.rows[0];
    const url = await storage.resolveUrl("manuals", manualRow.file_url);

    return res.json({
      success: true,
      data: {
        manual: {
          ...manualRow,
          url,
        },
      },
    });
  } catch (error) {
    logger.error("Upload product manual error", { error });
    console.error("Upload product manual error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload manual",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const uploadProductBrochure = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const file = (req as Request & { file?: Express.Multer.File }).file;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "Product ID is required",
    });
  }

  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  try {
    const fileName = sanitizeFilename(file.originalname);
    const filePath = `${Date.now()}-${fileName}`;
    const title = req.body.title || file.originalname.replace(/\.[^.]+$/, "");
    let savedPath: string;

    try {
      const result = await storage.upload("brochures", filePath, file.buffer, {
        contentType: file.mimetype,
      });
      savedPath = result.path;
    } catch (error) {
      logger.error("Upload product brochure error", { error });
      return res.status(500).json({
        success: false,
        message: "Failed to upload brochure",
      });
    }

    const inserResult = await pool.query(
      `INSERT INTO machine_brochures (machine_id, product_id, title, file_url, uploaded_at)
       VALUES (NULL, $1, $2, $3, NOW())
       RETURNING brochure_id, title, file_url, uploaded_at, product_id`,
      [productId, title, savedPath],
    );
    const brochureRow = inserResult.rows[0];
    const url = await storage.resolveUrl("brochures", brochureRow.file_url);

    return res.json({
      success: true,
      data: {
        brochure: {
          ...brochureRow,
          url,
        },
      },
    });
  } catch (error) {
    logger.error("Upload product brochure error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to upload brochure",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const uploadProductImage = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const file = (req as Request & { file?: Express.Multer.File }).file;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "Product ID is required",
    });
  }

  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  try {
    // Determine if this is a brochure or gallery image based on the endpoint or request body
    const type = req.body.type || "gallery"; // default to gallery
    const bucket = type === "brochure" ? "brochures" : "gallery";
    const table = type === "brochure" ? "machine_brochures" : "machine_gallery";

    const fileName = sanitizeFilename(file.originalname);
    const filePath = `${Date.now()}-${fileName}`;
    const title = req.body.title || file.originalname.replace(/\.[^.]+$/, "");
    let savedPath: string;

    try {
      const result = await storage.upload(bucket, filePath, file.buffer, {
        contentType: file.mimetype,
      });
      savedPath = result.path;
    } catch (error) {
      logger.error(`Upload product ${type} error`, { error });
      return res.status(500).json({
        success: false,
        message: `Failed to upload ${type}`,
      });
    }

    let insertResult;
    if (table === "machine_brochures") {
      insertResult = await pool.query(
        `INSERT INTO machine_brochures (machine_id, product_id, title, file_url, uploaded_at)
         VALUES (NULL, $1, $2, $3, NOW())
         RETURNING brochure_id AS id, title, file_url, uploaded_at, product_id`,
        [productId, title, savedPath],
      );
    } else {
      insertResult = await pool.query(
        `INSERT INTO machine_gallery (machine_id, product_id, image_url, caption, uploaded_at)
         VALUES (NULL, $1, $2, $3, NOW())
         RETURNING gallery_id AS id, image_url AS file_url, caption AS title, uploaded_at, product_id`,
        [productId, savedPath, title],
      );
    }

    const row = insertResult.rows[0];
    const url = await storage.resolveUrl(bucket, row.file_url);

    return res.json({
      success: true,
      data: {
        [type]: {
          ...row,
          url,
        },
      },
    });
  } catch (error) {
    logger.error("Upload product image error", { error });
    console.error("Upload product image error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload image",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const uploadProductVideo = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const file = (req as Request & { file?: Express.Multer.File }).file;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "Product ID is required",
    });
  }

  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  try {
    const fileName = sanitizeFilename(file.originalname);
    const filePath = `${Date.now()}-${fileName}`; // Don't include bucket prefix
    const title = req.body.title || file.originalname.replace(/\.[^.]+$/, "");
    const video_type = req.body.video_type || "gallery";
    let savedPath: string;

    try {
      const result = await storage.upload("videos", filePath, file.buffer, {
        contentType: file.mimetype,
      });
      savedPath = result.path;
    } catch (error) {
      logger.error("Upload product video error", { error });
      return res.status(500).json({
        success: false,
        message: "Failed to upload video",
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO machine_videos (machine_id, product_id, video_type, title, video_url, uploaded_at)
       VALUES (NULL, $1, $2, $3, $4, NOW())
       RETURNING video_id, video_type, title, video_url, uploaded_at, product_id`,
      [productId, video_type, title, savedPath],
    );
    const videoRow = insertResult.rows[0];
    const url = await storage.resolveUrl("videos", videoRow.video_url);

    return res.json({
      success: true,
      data: {
        video: {
          ...videoRow,
          url,
        },
      },
    });
  } catch (error) {
    logger.error("Upload product video error", { error });
    console.error("Upload product video error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload video",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const addProductVideo = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const { video_url, video_type, title } = req.body;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "Product ID is required",
    });
  }

  if (!video_url) {
    return res.status(400).json({
      success: false,
      message: "Video URL is required",
    });
  }

  try {
    const insertResult = await pool.query(
      `INSERT INTO machine_videos (machine_id, product_id, video_type, title, video_url, uploaded_at)
       VALUES (NULL, $1, $2, $3, $4, NOW())
       RETURNING video_id, video_type, title, video_url, uploaded_at, product_id`,
      [
        productId,
        video_type || "gallery",
        title || "Untitled Video",
        video_url,
      ],
    );
    const videoRow = insertResult.rows[0];

    return res.json({
      success: true,
      data: {
        video: videoRow,
      },
    });
  } catch (error) {
    logger.error("Add product video URL error", { error });
    console.error("Add product video URL error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add video URL",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const uploadProductSpecification = async (
  req: Request,
  res: Response,
) => {
  const { productId } = req.params;
  const file = (req as Request & { file?: Express.Multer.File }).file;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "Product ID is required",
    });
  }

  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  // Specifications table doesn't support file uploads - it's for key-value pairs
  // Return a helpful error message
  return res.status(400).json({
    success: false,
    message:
      "Specification file uploads are not supported. The specifications table is designed for text key-value pairs. Please use the manual section for documentation files.",
  });
};

export const deleteProductManual = async (req: Request, res: Response) => {
  const { productId, manualId } = req.params;

  if (!productId || !manualId) {
    return res.status(400).json({
      success: false,
      message: "Product ID and manual ID are required",
    });
  }

  try {
    // Check if manual exists
    const result = await pool.query(
      `SELECT manual_id FROM machine_manuals WHERE manual_id = $1 AND product_id = $2`,
      [manualId, productId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Manual not found",
      });
    }

    // Delete from database
    await pool.query(
      `DELETE FROM machine_manuals WHERE manual_id = $1 AND product_id = $2`,
      [manualId, productId],
    );

    // Note: File remains in storage (no delete method implemented yet)
    // File can be cleaned up later with a maintenance script

    return res.json({
      success: true,
      message: "Manual deleted successfully",
    });
  } catch (error) {
    logger.error("Delete product manual error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to delete manual",
    });
  }
};

export const deleteProductBrochure = async (req: Request, res: Response) => {
  const { productId, brochureId } = req.params;

  if (!productId || !brochureId) {
    return res.status(400).json({
      success: false,
      message: "Product ID and brochure ID are required",
    });
  }

  try {
    const result = await pool.query(
      `SELECT brochure_id FROM machine_brochures WHERE brochure_id = $1 AND product_id = $2`,
      [brochureId, productId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Brochure not found",
      });
    }

    await pool.query(
      `DELETE FROM machine_brochures WHERE brochure_id = $1 AND product_id = $2`,
      [brochureId, productId],
    );

    return res.json({
      success: true,
      message: "Brochure deleted successfully",
    });
  } catch (error) {
    logger.error("Delete product brochure error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to delete brochure",
    });
  }
};

export const deleteProductImage = async (req: Request, res: Response) => {
  const { productId, imageId } = req.params;
  const { type } = req.query; // "gallery" or "brochure"

  if (!productId || !imageId) {
    return res.status(400).json({
      success: false,
      message: "Product ID and image ID are required",
    });
  }

  try {
    const isBrochure = type === "brochure";
    const table = isBrochure ? "machine_brochures" : "machine_gallery";
    const idColumn = isBrochure ? "brochure_id" : "gallery_id";

    // Check if image exists
    const result = await pool.query(
      `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = $1 AND product_id = $2`,
      [imageId, productId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Delete from database
    await pool.query(
      `DELETE FROM ${table} WHERE ${idColumn} = $1 AND product_id = $2`,
      [imageId, productId],
    );

    // Note: File remains in storage (no delete method implemented yet)
    // File can be cleaned up later with a maintenance script

    return res.json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    logger.error("Delete product image error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to delete image",
    });
  }
};

export const deleteProductVideo = async (req: Request, res: Response) => {
  const { productId, videoId } = req.params;

  if (!productId || !videoId) {
    return res.status(400).json({
      success: false,
      message: "Product ID and video ID are required",
    });
  }

  try {
    // Get the video info before deleting (to verify it exists)
    const result = await pool.query(
      `SELECT video_id FROM machine_videos WHERE video_id = $1 AND product_id = $2`,
      [videoId, productId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Video not found",
      });
    }

    // Delete from database
    await pool.query(
      `DELETE FROM machine_videos WHERE video_id = $1 AND product_id = $2`,
      [videoId, productId],
    );

    // Note: Video file remains in storage if not YouTube (no delete method implemented yet)
    // File can be cleaned up later with a maintenance script

    return res.json({
      success: true,
      message: "Video deleted successfully",
    });
  } catch (error) {
    logger.error("Delete product video error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to delete video",
    });
  }
};

export const deleteProductSpecification = async (
  req: Request,
  res: Response,
) => {
  const { productId, specId } = req.params;

  if (!productId || !specId) {
    return res.status(400).json({
      success: false,
      message: "Product ID and specification ID are required",
    });
  }

  try {
    // Check if specification exists
    const result = await pool.query(
      `SELECT spec_id FROM machine_specifications WHERE spec_id = $1 AND product_id = $2`,
      [specId, productId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Specification not found",
      });
    }

    // Delete from database
    await pool.query(
      `DELETE FROM machine_specifications WHERE spec_id = $1 AND product_id = $2`,
      [specId, productId],
    );

    // Note: File remains in storage if file_url exists (no delete method implemented yet)
    // File can be cleaned up later with a maintenance script

    return res.json({
      success: true,
      message: "Specification deleted successfully",
    });
  } catch (error) {
    logger.error("Delete product specification error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to delete specification",
    });
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

    logger.info("Employee created", {
      employee_id: result.rows[0].employee_id,
    });

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
      [
        firstname,
        lastname,
        middlename,
        email,
        role_id,
        department_id,
        employeeId,
      ],
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

export const uploadGalleryImage = async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const { machineId } = req.body;

  if (!file || !machineId) {
    return res
      .status(400)
      .json({ success: false, message: "Missing file or machine id" });
  }

  const parsedMachineId = parseInt(String(machineId), 10);
  if (isNaN(parsedMachineId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid machine id" });
  }

  try {
    const machineResult = await pool.query(
      `SELECT product_id FROM machines WHERE machine_id = $1`,
      [parsedMachineId],
    );
    const productId = machineResult.rows[0]?.product_id ?? null;
    if (!productId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing product for machine" });
    }

    const fileName = file.originalname.replace(/[^\w.-]+/g, "_");
    const filePath = `gallery/machine_${parsedMachineId}/${fileName}`;

    let savedPath: string;
    try {
      const result = await storage.upload("gallery", filePath, file.buffer, {
        contentType: file.mimetype,
      });
      savedPath = result.path;
    } catch {
      return res.status(500).json({ success: false, message: "Upload failed" });
    }

    const insert = await pool.query(
      `INSERT INTO machine_gallery (machine_id, product_id, image_url, uploaded_at)
      VALUES ($1, $2, $3, NOW()) RETURNING gallery_id, machine_id, image_url, uploaded_at, product_id`,
      [parsedMachineId, productId, savedPath],
    );

    const url = await storage.resolveUrl("gallery", savedPath);

    return res.json({
      success: true,
      data: { ...insert.rows[0], url },
    });
  } catch {
    return res.status(500).json({ success: false, message: "Upload failed" });
  }
};

export const uploadMachineVideo = async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const { machineId, videoType } = req.body;

  if (!file || !machineId || !videoType) {
    return res.status(400).json({
      success: false,
      message: "Missing file, machine id, or video type",
    });
  }

  const parsedMachineId = parseInt(String(machineId), 10);
  if (isNaN(parsedMachineId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid machine id" });
  }

  const safeType = String(videoType).toLowerCase().trim();

  try {
    const machineResult = await pool.query(
      `SELECT product_id FROM machines WHERE machine_id = $1`,
      [parsedMachineId],
    );
    const productId = machineResult.rows[0]?.product_id ?? null;
    if (!productId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing product for machine" });
    }
    const fileName = file.originalname.replace(/[^\w.-]+/g, "_");
    const filePath = `video/machine_${parsedMachineId}/${safeType}/${fileName}`;

    let savedPath: string;
    try {
      const result = await storage.upload("videos", filePath, file.buffer, {
        contentType: file.mimetype,
      });
      savedPath = result.path;
    } catch (error) {
      logger.error("Supabase video upload error", {
        error,
        machineId: parsedMachineId,
        videoType: safeType,
        fileSize: file.size,
      });
      const errorAny = error as any;
      if (
        errorAny?.message?.includes("exceeded the maximum allowed size") ||
        errorAny?.statusCode === "413" ||
        errorAny?.status === 413
      ) {
        return res.status(413).json({
          success: false,
          message: `File size (${Math.round(
            file.size / 1024 / 1024,
          )}MB) exceeds limit. Maximum file size is 50MB`,
        });
      }
      return res.status(500).json({
        success: false,
        message:
          (error as Error)?.message || "Failed to upload video to storage",
      });
    }

    const insert = await pool.query(
      `INSERT INTO machine_videos (machine_id, product_id, video_type, title, video_url, uploaded_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING video_id, machine_id, product_id, video_type, title, video_url, uploaded_at`,
      [parsedMachineId, productId, safeType, file.originalname, savedPath],
    );

    const url = await storage.resolveUrl("videos", savedPath);

    return res.json({
      success: true,
      data: { ...insert.rows[0], url },
    });
  } catch (error: any) {
    logger.error("Upload machine video error", {
      error: error.message || error,
      stack: error.stack,
      machineId: parsedMachineId,
      videoType: safeType,
    });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload video",
    });
  }
};

export const getSettings = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'storage_mode' LIMIT 1`,
    );

    const storageMode = (result.rows[0]?.value ?? "cloud") as "cloud" | "local";

    return res.json({
      success: true,
      data: { settings: { storage_mode: storageMode } },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load settings",
    });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  const { storage_mode } = req.body as { storage_mode?: string };

  if (storage_mode !== "cloud" && storage_mode !== "local") {
    return res.status(400).json({
      success: false,
      message: "Invalid storage_mode. Use 'cloud' or 'local'.",
    });
  }

  try {
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
      VALUES ('storage_mode', $1, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [storage_mode],
    );

    return res.json({
      success: true,
      data: { settings: { storage_mode } },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to save settings",
    });
  }
};

export const getCustomerQuoteRequests = async (req: Request, res: Response) => {
  try {
    const raw = req.params.customerId;
    const customerId = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }
    const result = await pool.query(
      `SELECT 
        qr.quote_id as id,
        qr.status,
        qr.total_amount,
        qr.notes as description,
        'Quote Request' as subject,
        qr.submitted_at as created_at,
        m.model_number as machine_name,
        NULL as quantity
       FROM quote_request qr
       LEFT JOIN quote_items qi ON qr.quote_id = qi.quote_id
       LEFT JOIN parts p ON qi.parts_id = p.parts_id
       LEFT JOIN machines m ON m.machine_id = (
         SELECT machine_id FROM machines WHERE customer_id = qr.customer_id LIMIT 1
       )
       WHERE qr.customer_id = $1
       GROUP BY qr.quote_id, qr.status, qr.total_amount, qr.notes, qr.submitted_at, m.model_number
       ORDER BY qr.submitted_at DESC`,
      [customerId],
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error("Get customer quote requests error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quote requests",
    });
  }
};

export const createCustomerQuoteRequest = async (
  req: Request,
  res: Response,
) => {
  try {
    const raw = req.params.customerId;
    const customerId = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }
  } catch (error) {
    logger.error("Create customer quote request error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to create quote request",
    });
  }
};

export const getCustomerQuotes = async (req: Request, res: Response) => {
  try {
    const raw = req.params.customerId;
    const customerId = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }
    const result = await pool.query(
      `SELECT 
        sr.service_request_id as id,
        sr.subject,
        sr.description,
        sr.priority,
        sr.status,
        sr.created_at,
        m.model_number as machine_name,
        NULL as quantity
       FROM service_request sr
       LEFT JOIN machines m ON sr.machine_id = m.machine_id
       WHERE sr.customer_id = $1
       ORDER BY sr.created_at DESC`,
      [customerId],
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error("Get customer quotes error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer service requests",
    });
  }
};

export const getCustomerServiceRequests = async (
  req: Request,
  res: Response,
) => {
  try {
    const raw = req.params.customerId;
    const customerId = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }
    const result = await pool.query(
      `SELECT
        sr.service_request_id as id,
        sr.subject,
        sr.description,
        sr.priority,
        sr.status,
        sr.created_at,
        m.model_number as machine_name,
        NULL as quantity
        FROM service_request sr
        LEFT JOIN machines m ON sr.machine_id = m.machine_id
        WHERE sr.customer_id = $1
        ORDER BY sr.created_at DESC`,
      [customerId],
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error("Get customer service requests error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer service requests",
    });
  }
};

export const createCustomerServiceRequest = async (
  req: Request,
  res: Response,
) => {
  try {
    const raw = req.params.customerId;
    const customerId = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    const { machine_id, subject, description, priority } = req.body;

    const result = await pool.query(
      `INSERT INTO service_request 
       (customer_id, machine_id, subject, description, priority, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING service_request_id as id, customer_id, machine_id, subject, description, priority, status, created_at`,
      [
        customerId,
        machine_id || null,
        subject,
        description || null,
        priority || "medium",
      ],
    );

    logger.info("Service request created via admin", {
      service_request_id: result.rows[0].id,
      customer_id: customerId,
    });

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error("Create customer service request error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to create service request",
    });
  }
};
