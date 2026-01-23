import express from "express";
import * as controller from "./admin.controller";
import validate from "../../middlewares/validate.middleware";
import multer from "multer";
import { createEmployeeSchema, updateEmployeeSchema } from "./admin-user.schema";
import {
  addMachineAdminProductSchema,
  addMachineAssetsSchema,
} from "../machines/machine.schema";
import {
  addMachineForAdmin,
  addMachineAssetsForAdmin,
} from "../machines/machine.controller";
import { employeeAuth } from "../../middlewares/auth.middleware";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

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
router.get("/machines", employeeAuth, controller.getMachines);
router.get("/manuals", employeeAuth, controller.getManuals);
router.get("/brochures", employeeAuth, controller.getBrochures);
router.post(
  "/manuals/upload",
  employeeAuth,
  upload.single("file"),
  controller.uploadManualFile,
);
router.post(
  "/brochures/upload",
  employeeAuth,
  upload.single("file"),
  controller.uploadBrochureFile,
);
router.post(
  "/products/profile-image",
  employeeAuth,
  upload.single("file"),
  controller.uploadProductProfileImage,
);

// Admin machine creation
router.post(
  "/machines",
  employeeAuth,
  validate(addMachineAdminProductSchema, "body"),
  addMachineForAdmin,
);
router.post(
  "/machines/:machineId/assets",
  employeeAuth,
  validate(addMachineAssetsSchema, "body"),
  addMachineAssetsForAdmin,
);

router.post(
  "/gallery/upload",
  employeeAuth,
  upload.single("file"),
  controller.uploadGalleryImage,
);

router.post(
  "/videos/upload",
  employeeAuth,
  upload.single("file"),
  controller.uploadMachineVideo,
);


export default router;
