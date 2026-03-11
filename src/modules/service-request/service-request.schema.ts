import z from "zod";

export const createServiceRequestSchema = z.object({
  machine_id: z
    .number()
    .int()
    .positive("Machine ID must be a positive integer")
    .optional(),
  subject: z.string().min(1, "Subject is required"),
  description: z.string().optional(),
  address: z.string().optional(),
});

export const updateServiceRequestSchema = z.object({
  status: z.enum([
    "pending",
    "assigned",
    "in_progress",
    "completed",
    "cancelled",
  ]),
  notes: z.string().optional(),
});

export const assignTechnicianSchema = z.object({
  technician_id: z
    .number()
    .int()
    .positive("Technician ID must be a positive integer"),
  notes: z.string().optional(),
});

export const createNoteSchema = z.object({
  note_text: z.string().min(1, "Note text is required").max(2000, "Note text must be less than 2000 characters"),
});
