import express from "express";
import * as controller from "./machine.controller";
import validate from "../../middlewares/validate.middleware";
import { addMachineSchema, addMachineAssetsSchema } from "./machine.schema";
import { customerAuth } from "../../middlewares/auth.middleware";

const router = express.Router();

router.post("/", customerAuth, validate(addMachineSchema, "body"), controller.addMachine);
router.get("/", customerAuth, controller.getMyMachines);
router.get("/:machineId", customerAuth, controller.getMachineDetails);
router.post(
  "/:machineId/assets",
  customerAuth,
  validate(addMachineAssetsSchema, "body"),
  controller.addMachineAssets,
);

export default router;
