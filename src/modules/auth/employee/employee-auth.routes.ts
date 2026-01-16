import { Router } from "express";
import * as controller from "./employee-auth.controller";

const router = Router();

// Public
router.post("/login", controller.login);

export default router;
