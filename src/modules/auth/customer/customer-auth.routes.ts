import express from "express";
import * as controller from "./customer-auth.controller";
import validate from "../../../middlewares/validate.middleware";
import { customerLoginSchema } from "./customer-auth.schema";
import { customerAuth } from "../../../middlewares/auth.middleware";

const router = express.Router();

router.post("/login", validate(customerLoginSchema, "body"), controller.login);
router.post("/logout", controller.logout);
router.get("/me", customerAuth, controller.getMe);

export default router;
