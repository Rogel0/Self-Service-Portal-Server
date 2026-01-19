import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as controller from "./employee-auth.controller";
import { employeeLoginSchema } from "./employee-auth.schema";
import validate from "../../../middlewares/validate.middleware";

const router = Router();

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

export default router;
