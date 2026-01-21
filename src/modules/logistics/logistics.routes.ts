import express from "express";
import * as controller from "./logistics.controller";
import validate from "../../middlewares/validate.middleware";
import { updateTrackingSchema } from "../parts-request/parts-request.schema";
import { employeeAuth } from "../../middlewares/auth.middleware";

const router = express.Router();

router.get("/shipments", employeeAuth, controller.getShipments);
router.put("/shipments/:trackingId/status", employeeAuth, validate(updateTrackingSchema, "body"), controller.updateShipmentStatus);

export default router;
