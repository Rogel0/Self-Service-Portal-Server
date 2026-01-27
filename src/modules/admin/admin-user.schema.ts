import { z } from "zod";

export const createEmployeeSchema = z.object({
  firstname: z.string().min(1, "First name is required"),
  lastname: z.string().min(1, "Last name is required"),
  middlename: z.string().optional(),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  role_id: z.number().int().positive("Role is required"),
  department_id: z.number().int().positive("Department is required"),
  password: z.string().min(8).optional(),
});

export const updateEmployeeSchema = z.object({
  firstname: z.string().min(1).optional(),
  lastname: z.string().min(1).optional(),
  middlename: z.string().optional(),
  email: z.string().email().optional(),
  role_id: z.number().int().positive().optional(),
  department_id: z.number().int().positive().optional(),
});

export const updateEmployeePermissionSchema = z.object({
  permission_key: z.enum([
    "machines_manage",
    "machines_add",
    "manuals_manage",
    "brochures_manage",
    "products_manage",
    "tracking_manage",
    "account_requests_manage",
    "parts_requests_manage",
    "quotes_manage",
  ]),
  allowed: z.boolean(),
});
