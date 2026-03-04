import { z } from "zod";

export const customerRegistrationSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  middle_name: z.string().optional(),
  company_name: z.string().optional(),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 characters"),
  landline: z.string().optional(),
  username: z.string().min(3, "Username must be at least 3 characters"),
  initial_product_id: z.coerce.number().int().positive("Product is required"),
  initial_product_name: z.string().min(1, "Product name is required"),
  initial_model_number: z.string().min(1, "Model number is required"),
  initial_serial_number: z.string().min(1, "Serial number is required"),
  initial_purchase_date: z.string().optional(),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});
