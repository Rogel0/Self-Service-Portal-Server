import express from "express";
import * as controller from "./service-request.admin.controller";
import {
  employeeAuth,
  requireAdminOrPermission,
} from "../../middlewares/auth.middleware";

const router = express.Router();

const requireServiceRequestsManage = requireAdminOrPermission(
  "service_requests_manage",
);

router.get(
  "/",
  employeeAuth,
  requireServiceRequestsManage,
  controller.getAllServiceRequests,
);
router.get(
  "/:requestId",
  employeeAuth,
  requireServiceRequestsManage,
  controller.getServiceRequestById,
);
router.patch(
  "/:requestId",
  employeeAuth,
  requireServiceRequestsManage,
  controller.updateServiceRequest,
);
router.post(
  "/:requestId/assign",
  employeeAuth,
  requireServiceRequestsManage,
  controller.assignTechnician,
);
router.delete(
  "/:requestId/assign/:technicianId",
  employeeAuth,
  requireServiceRequestsManage,
  controller.unassignTechnician,
);

// router.get("/", employeeAuth, controller.getAllServiceRequests);
// router.patch("/:requestId", employeeAuth, controller.updateServiceRequest);
// router.post("/:requestId/assign", employeeAuth, controller.assignTechnician);
// router.get("/:requestId", employeeAuth, controller.getServiceRequestById);
// router.delete(
//   "/:requestId/assign/:technicianId",
//   employeeAuth,
//   controller.unassignTechnician,
// );

export default router;
