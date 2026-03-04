import { Pool } from "pg";
import { env } from "./env";

const pool = new Pool({
  connectionString: env.PG_URI,
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

export default pool;
