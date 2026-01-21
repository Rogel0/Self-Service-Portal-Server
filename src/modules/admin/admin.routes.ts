import express from "express";
import * as controller from "./admin.controller";
import validate from "../../middlewares/validate.middleware";
import { createEmployeeSchema, updateEmployeeSchema } from "./admin-user.schema";
import {
  addMachineAdminSchema,
  addMachineAssetsSchema,
} from "../machines/machine.schema";
import {
  addMachineForAdmin,
  addMachineAssetsForAdmin,
} from "../machines/machine.controller";
import { employeeAuth } from "../../middlewares/auth.middleware";

const router = express.Router();

router.get("/registrations/pending", employeeAuth, controller.getPendingRegistrations);
router.post("/registrations/:customerId/approve", employeeAuth, controller.approveRegistration);
router.get("/parts-requests", employeeAuth, controller.getAllPartsRequests);

// User management
router.get("/users/employees", employeeAuth, controller.getEmployees);
router.post(
  "/users/employees",
  employeeAuth,
  validate(createEmployeeSchema, "body"),
  controller.createEmployee,
);
router.put(
  "/users/employees/:employeeId",
  employeeAuth,
  validate(updateEmployeeSchema, "body"),
  controller.updateEmployee,
);
router.get("/users/customers", employeeAuth, controller.getCustomers);
router.get("/users/roles", employeeAuth, controller.getRoles);
router.get("/users/departments", employeeAuth, controller.getDepartments);

// Admin machine creation
router.post(
  "/machines",
  employeeAuth,
  validate(addMachineAdminSchema, "body"),
  addMachineForAdmin,
);
router.post(
  "/machines/:machineId/assets",
  employeeAuth,
  validate(addMachineAssetsSchema, "body"),
  addMachineAssetsForAdmin,
);

export default router;
