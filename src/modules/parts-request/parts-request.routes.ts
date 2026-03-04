import express from "express";
import * as controller from "./parts-request.controller";
import validate from "../../middlewares/validate.middleware";
import { createPartsRequestSchema } from "./parts-request.schema";
import { customerAuth } from "../../middlewares/auth.middleware";

const router = express.Router();

router.post("/", customerAuth, validate(createPartsRequestSchema, "body"), controller.createPartsRequest);
router.get("/", customerAuth, controller.getMyPartsRequests);
router.get("/:requestId", customerAuth, controller.getPartsRequestDetails);
router.post("/:requestId/accept-quote", customerAuth, controller.acceptQuote);
router.post("/:requestId/payment-proof", customerAuth, controller.uploadPaymentProof);

export default router;
