import { z } from "zod";

export const addMachineSchema = z.object({
  model_number: z.string().min(1, "Model number is required"),
  product_id: z.number().int().positive().optional(),
});

export const addMachineAdminSchema = addMachineSchema;

export const assignMachineToCustomerSchema = z.object({
  product_id: z.coerce.number().int().positive("Product is required"),
  serial_number: z.string().min(1, "Serial number is required"),
  model_number: z.string().optional(),
  purchase_date: z.string().optional(),
});

export const addMachineAdminProductSchema = addMachineAdminSchema.extend({
  product_name: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  // Accept full URL or storage path (e.g. "products/123-image.png") so we can store path
  // Convert empty strings to undefined before validation
  profile_image_url: z
    .preprocess(
      (val) => (val === "" ? undefined : val),
      z
        .string()
        .min(1)
        .refine(
          (v) => v.startsWith("http") || /^[\w./-]+$/.test(v),
          "Must be a valid URL or storage path",
        )
        .optional(),
    ),
});

export const updateMachineSchema = z.object({
  purchase_date: z.string().optional(),
  status: z.enum(["active", "inactive", "maintenance"]).optional(),
});

export const addMachineAssetsSchema = z.object({
  manuals: z
    .array(
      z.object({
        title: z.string().min(1, "Title is required"),
        file_url: z.string().url("Invalid file URL"),
      }),
    )
    .optional(),
  gallery: z
    .array(
      z.object({
        image_url: z.string().url("Invalid image URL"),
        caption: z.string().optional(),
      }),
    )
    .optional(),
  brochures: z
    .array(
      z.object({
        title: z.string().min(1, "Title is required"),
        file_url: z.string().url("Invalid file URL"),
      }),
    )
    .optional(),
  videos: z
    .array(
      z.object({
        video_type: z.string().min(1, "Video type is required"),
        title: z.string().min(1, "Title is required"),
        video_url: z.string().url("Invalid video URL"),
      }),
    )
    .optional(),
  specifications: z
    .array(
      z.object({
        spec_name: z.string().min(1, "Spec name is required"),
        spec_value: z.string().min(1, "Spec value is required"),
      }),
    )
    .optional(),
    manual_ids: z.array(z.number().int().positive()).optional(),
    brochure_ids: z.array(z.number().int().positive()).optional(),
});
