import { z } from "zod";

export const createNewsSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().optional(),
  video_url: z.string().url("Invalid video URL"),
  thumbnail_url: z
    .string()
    .url("Invalid thumbnail URL")
    .optional()
    .or(z.literal("")),
  category: z.string().default("News"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export const updateNewsSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  video_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional().or(z.literal("")),
  category: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});
