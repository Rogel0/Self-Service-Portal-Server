import express from "express";
import cors from "cors";
import employeeAuthRoutes from "./modules/auth/employee/employee-auth.routes";
import customerAuthRoutes from "./modules/auth/customer/customer-auth.routes";
import unifiedAuthRoutes from "./modules/auth/auth.routes";
import cookieParser from "cookie-parser";

const app = express();

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173", // or your client URL
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Routes
// unified endpoints (preferred)
app.use("/api/auth", unifiedAuthRoutes);

// keep legacy mounts for explicit routes
app.use("/api/auth/employee", employeeAuthRoutes);
app.use("/api/auth/customer", customerAuthRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.send("API is running...");
});
// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

export default app;
