import { Router } from "express";
import * as controller from "./service-request.technician.controller";
import { employeeAuth } from "../../middlewares/auth.middleware";
import { requireAdminOrPermission } from "../../middlewares/auth.middleware";

const router = Router();

router.get(
  "/my-requests",
  employeeAuth,
  requireAdminOrPermission("account_technicians_manage"),
  controller.getMyAssignedRequests,
);

router.patch(
  "/my-requests/:requestId/status",
  employeeAuth,
  requireAdminOrPermission("account_technicians_manage"),
  controller.updateMyRequestStatus,
);

export default router;
