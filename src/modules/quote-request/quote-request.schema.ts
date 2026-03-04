import { z } from "zod";

export const createQuoteRequestSchema = z.object({
  items: z.array(
    z.object({
      parts_id: z.number().int().positive("Parts ID must be a positive integer"),
      quantity: z.number().int().positive("Quantity must be a positive integer"),
    })
  ).min(1, "At least one part is required"),
  notes: z.string().optional(),
});

export const approveQuoteSchema = z.object({
  approved: z.boolean(),
  notes: z.string().optional(),
});
