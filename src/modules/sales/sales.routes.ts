import express from "express";
import * as controller from "./sales.controller";
import validate from "../../middlewares/validate.middleware";
import { verifyCallSchema, verifyPaymentSchema } from "../parts-request/parts-request.schema";
import { employeeAuth, requireRole } from "../../middlewares/auth.middleware";

const router = express.Router();

router.get("/parts-requests", employeeAuth, controller.getPartsRequestsForVerification);
router.post("/parts-requests/:requestId/send-quote", employeeAuth, controller.sendQuote);
router.post("/parts-requests/:requestId/verify-call", employeeAuth, validate(verifyCallSchema, "body"), controller.verifyCall);
router.post("/parts-requests/:requestId/verify-payment", employeeAuth, validate(verifyPaymentSchema, "body"), controller.verifyPayment);
router.post("/parts-requests/:requestId/accept", employeeAuth, controller.acceptRequest);

export default router;
