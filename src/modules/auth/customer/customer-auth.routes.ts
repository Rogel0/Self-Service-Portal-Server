import express from "express";
import * as controller from "./customer-auth.controller";
import * as registrationController from "./customer-registration.controller";
import validate from "../../../middlewares/validate.middleware";
import { customerLoginSchema } from "./customer-auth.schema";
import { customerRegistrationSchema, changePasswordSchema } from "./customer-registration.schema";
import { customerAuth } from "../../../middlewares/auth.middleware";

const router = express.Router();

router.post("/register", validate(customerRegistrationSchema, "body"), registrationController.register);
router.post("/login", validate(customerLoginSchema, "body"), controller.login);
router.post("/logout", controller.logout);
router.get("/me", customerAuth, controller.getMe);
router.post("/change-password", customerAuth, validate(changePasswordSchema, "body"), registrationController.changePassword);

export default router;
