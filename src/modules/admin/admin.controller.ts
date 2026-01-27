import { Request, Response } from "express";
import pool from "../../config/database";
import { hashPassword } from "../../utils/hash";
import logger from "../../utils/logger";
import { supabase } from "../../utils/supabase";

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
        END AS quotes_manage_source
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
    permission_key: "machines_manage";
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
    const filePath = `manuals/${Date.now()}-${fileName}`;
    const title = file.originalname.replace(/\.[^.]+$/, "");

    const { data, error } = await supabase.storage
      .from("manuals")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      logger.error("Supabase upload error", { error });
      return res.status(500).json({
        success: false,
        message: "Failed to upload manual",
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO machine_manuals (machine_id, product_id, title, file_url, uploaded_at)
       VALUES (NULL, NULL, $1, $2, NOW())
       RETURNING manual_id, title, file_url, uploaded_at, product_id`,
      [title, data.path],
    );
    const manualRow = insertResult.rows[0];
    const url = await getManualUrl(manualRow.file_url);

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
        url: await getManualUrl(row.file_url),
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
    const filePath = `brochures/${Date.now()}-${fileName}`;
    const title = file.originalname.replace(/\.[^.]+$/, "");

    const { data, error } = await supabase.storage
      .from("brochures")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      logger.error("Supabase brochure upload error", { error });
      return res.status(500).json({
        success: false,
        message: "Failed to upload brochure",
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO machine_brochures (machine_id, product_id, title, file_url, uploaded_at)
       VALUES (NULL, NULL, $1, $2, NOW())
       RETURNING brochure_id, title, file_url, uploaded_at, product_id`,
      [title, data.path],
    );
    const brochureRow = insertResult.rows[0];
    const url = await getBrochureUrl(brochureRow.file_url);

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
        url: await getBrochureUrl(row.file_url),
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

export const uploadProductProfileImage = async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  try {
    const fileName = sanitizeFilename(file.originalname);
    const filePath = `products/${Date.now()}-${fileName}`;

    const { data, error } = await supabase.storage
      .from("products")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      logger.error("Supabase product image upload error", { error });
      return res.status(500).json({
        success: false,
        message: "Failed to upload product image",
      });
    }

    const url = await getProductImageUrl(data.path);
    return res.json({
      success: true,
      data: {
        image: {
          file_url: data.path,
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

export const uploadGalleryImage = async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const { machineId } = req.body;

  if(!file || !machineId) {
    return res.status(400).json({ success: false, message: "Missing file or machine id" });
  }

  try {
    const machineResult = await pool.query(
      `SELECT product_id FROM machines WHERE machine_id = $1`,
      [machineId],
    );
    const productId = machineResult.rows[0]?.product_id ?? null;
    if (!productId) {
      return res.status(400).json({ success: false, message: "Missing product for machine" });
    }

    const fileName = file.originalname.replace(/[^\w.-]+/g, "_");
    const filePath = `gallery/machine_${machineId}/${fileName}`;

    const { data, error } = await supabase.storage.from("gallery").upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) {
      return res.status(500).json({ success: false, message: "Upload failed" });
    }

    const insert = await pool.query(
      `INSERT INTO machine_gallery (machine_id, product_id, image_url, uploaded_at)
      VALUES (NULL, $1, $2, NOW()) RETURNING gallery_id, image_url, uploaded_at, product_id`,
      [productId, data.path],
    );

    const { data: publicUrl } = supabase.storage.from("gallery").getPublicUrl(data.path);

    return res.json({
      success: true,
      data: { ...insert.rows[0], url: publicUrl.publicUrl },
    });
  } catch {
    return res.status(500).json({ success: false, message: "Upload failed" });
  }
};

export const uploadMachineVideo = async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const { machineId, videoType } = req.body;

  if (!file || !machineId || !videoType) {
    return res.status(400).json({ success: false, message: "Missing file, machine id, or video type" });
  }

  try {
    const machineResult = await pool.query(
      `SELECT product_id FROM machines WHERE machine_id = $1`,
      [machineId],
    );
    const productId = machineResult.rows[0]?.product_id ?? null;
    if (!productId) {
      return res.status(400).json({ success: false, message: "Missing product for machine" });
    }

    const safeType = String(videoType).toLowerCase().trim();
    const fileName = file.originalname.replace(/[^\w.-]+/g, "_");
    const filePath = `video/machine_${machineId}/${safeType}/${fileName}`;

    const { data, error } = await supabase.storage.from("videos").upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

    if (error) {
      return res.status(500).json({ success: false, message: "Upload failed" });
    }

    const insert = await pool.query(
      `INSERT INTO machine_videos (machine_id, product_id, video_type, title, video_url, uploaded_at)
      VALUES (NULL, $1, $2, $3, $4, NOW())
      RETURNING video_id, machine_id, product_id, video_type, title, video_url, uploaded_at`,
      [productId, safeType, file.originalname, data.path],
    );

    const { data: publicUrl } = supabase.storage.from("videos").getPublicUrl(data.path);

    return res.json({
      success: true,
      data: { ...insert.rows[0], url: publicUrl.publicUrl },
    });
  } catch {
    return res.status(500).json({ success: false, message: "Upload failed" });
  }
};