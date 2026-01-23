import express from "express";
import * as controller from "./products.controller";
import { employeeAuth } from "../../middlewares/auth.middleware";

const router = express.Router();

router.get("/", controller.getProducts);
router.get("/:productId/details", controller.getProductDetails);
router.post("/", employeeAuth, controller.createProduct);
router.get("/parts", controller.getAllParts);
router.get("/:productId/parts", controller.getPartsByProduct);

export default router;
