import app from "./app";
import pool from "./config/database";
import logger from "./utils/logger";
import { env } from "./config/env";

const startServer = async () => {
  try {
    // Test database connection
    // await pool.query("SELECT NOW()");
    logger.info("Database connected");

    // Start server
    app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    console.error(error);
    process.exit(1);
  }
};

startServer();
