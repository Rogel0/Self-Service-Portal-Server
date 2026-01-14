import { Pool } from "pg";
import logger from "../utils/logger";
import dotenv from "dotenv";

dotenv.config();

logger.info(
  "Attempting to connect with URI:",
  process.env.PG_URI?.replace(/:[^:]*@/, ":****@")
); // Hide password

const pool = new Pool({
  connectionString: process.env.PG_URI,
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    logger.error("Connection failed:", err.message);
    logger.error("Full error:", err);
  } else {
    logger.info("Successfully connected to PostgreSQL");
    release();
  }
});

pool.on("error", (err: Error) => {
  logger.error("Unexpected error on idle client", err);
  process.exit(-1);
});

export default pool;
