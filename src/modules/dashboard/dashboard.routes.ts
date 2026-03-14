import express from "express";
import { getDashboardMetrics, getFilterOptions } from "./dashboard.controller";
import { employeeAuth } from "../../middlewares/auth.middleware";
import { adminOnly } from "../../middlewares/admin.middleware";

const router = express.Router();

router.use(employeeAuth);
router.use(adminOnly);

router.get("/metrics", getDashboardMetrics);
router.get("/filter-options", getFilterOptions);

export default router;
