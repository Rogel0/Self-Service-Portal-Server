import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./config/database";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Test database connection
pool.query("SELECT NOW()", (err: Error | null, res: any) => {
  if (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  }
  console.log("Database connected");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// MUST HAVE: Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
