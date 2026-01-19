import { Router } from "express";
import express from "express";
import { employeeAuth as authenticate } from "../../../middlewares/auth.middleware";
import { getMe } from "./employee-auth.controller";
import rateLimit from "express-rate-limit";
import * as controller from "./employee-auth.controller";
import { employeeLoginSchema } from "./employee-auth.schema";
import validate from "../../../middlewares/validate.middleware";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many login attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public
router.post(
  "/login",
  loginLimiter,
  validate(employeeLoginSchema, "body"),
  controller.login,
);

router.post("/logout", controller.logout);
router.get("/me", authenticate, getMe);

export default router;
