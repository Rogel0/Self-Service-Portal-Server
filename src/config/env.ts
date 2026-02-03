import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || "5000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  PG_URI: process.env.PG_URI || "",
  JWT_SECRET: process.env.JWT_SECRET || "",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "",
  UPLOADS_BASE_URL: process.env.UPLOADS_BASE_URL || `http://localhost:${process.env.PORT || "5000"}`,
  UPLOADS_DIR: process.env.UPLOADS_DIR || ""
} as const;

// Validate required env vars
const requiredEnvVars = [
  "PG_URI",
  "JWT_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
