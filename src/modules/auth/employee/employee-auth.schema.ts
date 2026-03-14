import { z } from "zod";

export const employeeLoginSchema = z.object({
  username: z.string().min(1, "username is required").max(256),
  password: z.string().min(8, "password must be at least 8 characters"),
  keepSignedIn: z.boolean().optional(),
});

export const employeeChangePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(8, "Password must be at least 8 characters"),
});
