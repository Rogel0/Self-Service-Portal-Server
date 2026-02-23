import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import employeeAuthRoutes from "./modules/auth/employee/employee-auth.routes";
import customerAuthRoutes from "./modules/auth/customer/customer-auth.routes";
import unifiedAuthRoutes from "./modules/auth/auth.routes";
import profileRoutes from "./modules/profile/profile.routes";
import machineRoutes from "./modules/machines/machine.routes";
import cookieParser from "cookie-parser";
import path from "path";
import { getUploadsDir } from "./services/storage";
import partsRequestRoutes from "./modules/parts-request/parts-request.routes";
import quoteRequestRoutes from "./modules/quote-request/quote-request.routes";
import adminRoutes from "./modules/admin/admin.routes";
import salesRoutes from "./modules/sales/sales.routes";
import logisticsRoutes from "./modules/logistics/logistics.routes";
import productsRoutes from "./modules/products/products.routes";
import serviceRequestRoutes from "./modules/service-request/service-request.routes";
import adminServiceRequestRoutes from "./modules/service-request/service-request.admin.routes";

const app = express();

// Security middleware (allow cross-origin so dev client on different port can load /uploads images)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  skip: (req) => req.path.startsWith("/auth"),
});
app.use("/api/", limiter);

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Serve uploads; allow cross-origin so client on different port (e.g. localhost:5173) can load images
app.use(
  "/uploads",
  express.static(getUploadsDir(), {
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

// Routes
// unified endpoints (preferred)
app.use("/api/auth", unifiedAuthRoutes);

// keep legacy mounts for explicit routes
app.use("/api/auth/employee", employeeAuthRoutes);
app.use("/api/auth/customer", customerAuthRoutes);

// Simple profile endpoint for client-side profile fetching (returns employee/customer)
app.use("/api/profile", profileRoutes);

//Service request routes
app.use("/api/service-requests", serviceRequestRoutes);

app.use("/api/admin/service-requests", adminServiceRequestRoutes);

// Machine routes
app.use("/api/machines", machineRoutes);

// Parts request routes
app.use("/api/parts-requests", partsRequestRoutes);

// Quote request routes
app.use("/api/quote-requests", quoteRequestRoutes);

// Admin routes
app.use("/api/admin", adminRoutes);

// Sales routes
app.use("/api/sales", salesRoutes);

// Logistics routes
app.use("/api/logistics", logisticsRoutes);

// Products routes
app.use("/api/products", productsRoutes);

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
