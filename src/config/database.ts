import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

console.log(
  "Attempting to connect with URI:",
  process.env.PG_URI?.replace(/:[^:]*@/, ":****@")
); // Hide password

const pool = new Pool({
  connectionString: process.env.PG_URI,
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Connection failed:", err.message);
    console.error("Full error:", err);
  } else {
    console.log("✅ Successfully connected to PostgreSQL");
    release();
  }
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

export default pool;
