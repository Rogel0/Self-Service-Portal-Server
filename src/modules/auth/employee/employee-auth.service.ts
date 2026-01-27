import pool from "../../../config/database";
import { comparePassword } from "../../../utils/hash";
import { generateToken } from "../../../utils/token";
import type { Employee, EmployeeSafe } from "../../../models/Employee";
import type {
  EmployeeLoginInput,
  EmployeeAuthResponse,
} from "./employee-auth.types";

// Remove password from employee object
const sanitizeEmployee = (employee: Employee): EmployeeSafe => {
  const { password, ...safe } = employee;
  return safe;
};

// Login
export const login = async (
  input: EmployeeLoginInput,
): Promise<EmployeeAuthResponse> => {
  const usernameOrEmail = (input.username ?? "").toString().trim();
  if (!usernameOrEmail || !input.password) {
    return { success: false, message: "Invalid username or password" };
  }

  try {
    const result = await pool.query(
      `SELECT e.employee_id, e.firstname, e.lastname, e.middlename, e.role_id, e.department_id,
       d.dept_name AS department,
       e.username, e.password, e.email, e.created_at, e.updated_at,
       COALESCE(ep_machines.allowed, dp_machines.allowed, false) AS machines_manage,
       COALESCE(ep_add.allowed, dp_add.allowed, false) AS machines_add,
       COALESCE(ep_manuals.allowed, dp_manuals.allowed, false) AS manuals_manage,
       COALESCE(ep_brochures.allowed, dp_brochures.allowed, false) AS brochures_manage,
       COALESCE(ep_products.allowed, dp_products.allowed, false) AS products_manage,
       COALESCE(ep_tracking.allowed, dp_tracking.allowed, false) AS tracking_manage,
       COALESCE(ep_accounts.allowed, dp_accounts.allowed, false) AS account_requests_manage,
       COALESCE(ep_parts.allowed, dp_parts.allowed, false) AS parts_requests_manage,
       COALESCE(ep_quotes.allowed, dp_quotes.allowed, false) AS quotes_manage
      FROM employee e
      JOIN department d ON e.department_id = d.dept_id
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
      WHERE lower(e.username) = lower($1) OR lower(e.email) = lower($1)
      LIMIT 1`,
      [usernameOrEmail],
    );

    const employee: Employee | undefined = result.rows[0];
    if (!employee) {
      return { success: false, message: "Invalid username or password" };
    }

    const isValid = await comparePassword(input.password, employee.password);
    if (!isValid) {
      return { success: false, message: "Invalid username or password" };
    }

    const token = generateToken({
      employee_id: employee.employee_id,
      username: employee.username,
      role_id: employee.role_id,
      department_id: employee.department_id,
    });

    // best-effort update last activity; don't fail login if this errors
    pool
      .query("UPDATE employee SET updated_at = NOW() WHERE employee_id = $1", [
        employee.employee_id,
      ])
      .catch(() => {
        /* ignore */
      });

    return {
      success: true,
      message: "Login successful",
      data: {
        employee: sanitizeEmployee(employee),
        token,
      },
    };
  } catch (err) {
    // do not expose internals
    return { success: false, message: "Invalid username or password" };
  }
};
