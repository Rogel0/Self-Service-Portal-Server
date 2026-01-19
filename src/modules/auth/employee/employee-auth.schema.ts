import { z } from "zod";

export const employeeLoginSchema = z.object({
  username: z.string().min(1, "username is required").max(256),
  password: z.string().min(8, "password must be at least 8 characters"),
  keepSignedIn: z.boolean().optional(),
});
