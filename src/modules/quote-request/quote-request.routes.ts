import express from "express";
import * as controller from "./quote-request.controller";
import validate from "../../middlewares/validate.middleware";
import { createQuoteRequestSchema, approveQuoteSchema } from "./quote-request.schema";
import { customerAuth, employeeAuth } from "../../middlewares/auth.middleware";

const router = express.Router();

// Customer routes
router.post("/", customerAuth, validate(createQuoteRequestSchema, "body"), controller.createQuoteRequest);
router.get("/", customerAuth, controller.getMyQuoteRequests);
router.get("/:quoteId", customerAuth, controller.getQuoteRequestDetails);
router.post("/:quoteId/accept", customerAuth, controller.acceptQuote);

// Admin/Sales routes
router.get("/admin/all", employeeAuth, controller.getAllQuoteRequests);
router.post("/admin/:quoteId/approve", employeeAuth, validate(approveQuoteSchema, "body"), controller.approveQuoteRequest);

export default router;
