import express from "express";
import * as controller from "./service-request.admin.controller";
import { employeeAuth } from "../../middlewares/auth.middleware";

const router = express.Router();

router.get("/", employeeAuth, controller.getAllServiceRequests);

// More specific routes MUST come before general /:requestId route
router.post("/:requestId/assign", employeeAuth, controller.assignTechnician);
router.delete(
  "/:requestId/assign/:technicianId",
  employeeAuth,
  controller.unassignTechnician,
);

// General routes with just /:requestId come last
router.get("/:requestId", employeeAuth, controller.getServiceRequestById);
router.patch("/:requestId", employeeAuth, controller.updateServiceRequest);

export default router;
