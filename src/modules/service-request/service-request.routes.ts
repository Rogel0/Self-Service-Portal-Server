import express from "express";
import * as controller from "./service-request.controller";
import validate from "../../middlewares/validate.middleware";
import {
  createServiceRequestSchema,
  updateServiceRequestSchema,
} from "./service-request.schema";
import { customerAuth, employeeAuth } from "../../middlewares/auth.middleware";

const router = express.Router();

router.post(
  "/",
  customerAuth,
  validate(createServiceRequestSchema, "body"),
  controller.createServiceRequest,
);
router.get("/", customerAuth, controller.getMyServiceRequests);
router.get("/:requestId", customerAuth, controller.getServiceRequestDetails);

export default router;
