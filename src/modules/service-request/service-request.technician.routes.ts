import { Router } from "express";
import * as controller from "./service-request.technician.controller";
import { employeeAuth } from "../../middlewares/auth.middleware";
import { requireAdminOrPermission } from "../../middlewares/auth.middleware";
import validate from "../../middlewares/validate.middleware";
import { createNoteSchema } from "./service-request.schema";

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

router.get(
  "/my-requests/:requestId/notes",
  employeeAuth,
  controller.getMyRequestNotes,
);

router.post(
  "/my-requests/:requestId/notes",
  employeeAuth,
  validate(createNoteSchema, "body"),
  controller.createMyRequestNote,
);

export default router;
