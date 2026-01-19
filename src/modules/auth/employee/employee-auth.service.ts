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
       d.dept_name AS department, -- add this line
       e.username, e.password, e.email, e.created_at, e.updated_at
      FROM employee e
      JOIN department d ON e.department_id = d.dept_id
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
