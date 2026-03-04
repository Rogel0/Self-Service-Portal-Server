import { z } from "zod";

export const createPartsRequestSchema = z.object({
  machine_id: z.number().int().positive("Machine ID must be a positive integer"),
  items: z.array(
    z.object({
      parts_id: z.number().int().positive("Parts ID must be a positive integer"),
      quantity: z.number().int().positive("Quantity must be a positive integer"),
    })
  ).min(1, "At least one part is required"),
  notes: z.string().optional(),
});

export const updatePartsRequestStatusSchema = z.object({
  status: z.enum(["pending", "quote_sent", "quote_accepted", "quote_rejected", "payment_pending", "payment_verified", "preparing", "waiting_to_ship", "shipping", "picked_up_by_courier", "tracking_number_posted", "received"]),
  notes: z.string().optional(),
});

export const verifyPaymentSchema = z.object({
  payment_verified: z.boolean(),
  payment_proof_url: z.string().url().optional(),
  notes: z.string().optional(),
});

export const verifyCallSchema = z.object({
  call_verified: z.boolean(),
  notes: z.string().optional(),
});

export const updateTrackingSchema = z.object({
  courier_type: z.enum(["own_delivery", "third_party"]),
  status: z.enum(["preparing", "waiting_to_ship", "shipping", "picked_up_by_courier", "tracking_number_posted", "received"]),
  tracking_number: z.string().optional(),
});
