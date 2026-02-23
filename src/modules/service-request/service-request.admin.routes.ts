import express from "express";
import * as controller from "./service-request.admin.controller";
import { employeeAuth } from "../../middlewares/auth.middleware";

const router = express.Router();

router.get("/", employeeAuth, controller.getAllServiceRequests);
router.get("/:requestId", employeeAuth, controller.getServiceRequestById);
router.patch("/:requestId", employeeAuth, controller.updateServiceRequest);

export default router;
