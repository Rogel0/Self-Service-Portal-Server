import express from "express";
import * as controller from "./admin.controller";
import validate from "../../middlewares/validate.middleware";
import multer from "multer";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  updateEmployeePermissionSchema,
} from "./admin-user.schema";
import {
  addMachineAdminProductSchema,
  addMachineAssetsSchema,
  assignMachineToCustomerSchema,
} from "../machines/machine.schema";
import {
  addMachineForAdmin,
  addMachineAssetsForAdmin,
} from "../machines/machine.controller";
import {
  employeeAuth,
  requirePermission,
  requireAdminOrPermission,
} from "../../middlewares/auth.middleware";
import { multerErrorHandler } from "../../middlewares/multer-error.middleware";

const router = express.Router();
const requireMachinesManage = requirePermission("machines_manage");
const requireMachinesAdd = requirePermission("machines_add");
const requireManualsManage = requirePermission("manuals_manage");
const requireBrochuresManage = requirePermission("brochures_manage");
const requireProductsManage = requirePermission("products_manage");
const requireTrackingManage = requirePermission("tracking_manage");
const requireAccountRequestsManage = requirePermission(
  "account_requests_manage",
);
const requirePartsRequestsManage = requirePermission("parts_requests_manage");
const requireQuotesManage = requirePermission("quotes_manage");
const requireCustomersManage = requireAdminOrPermission("customers_manage");
const requirePermissionsManage = requireAdminOrPermission("permissions_manage");
// File size limit set to 200MB for videos and large files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB for video files
});

router.get(
  "/registrations/pending",
  employeeAuth,
  requireAccountRequestsManage,
  controller.getPendingRegistrations,
);
router.post(
  "/registrations/:customerId/approve",
  employeeAuth,
  requireAccountRequestsManage,
  controller.approveRegistration,
);
router.get(
  "/parts-requests",
  employeeAuth,
  requirePartsRequestsManage,
  controller.getAllPartsRequests,
);

// User management
router.get(
  "/users/employees",
  employeeAuth,
  requirePermissionsManage,
  controller.getEmployees,
);
router.post(
  "/users/employees",
  employeeAuth,
  requirePermissionsManage,
  validate(createEmployeeSchema, "body"),
  controller.createEmployee,
);
router.put(
  "/users/employees/:employeeId",
  employeeAuth,
  requirePermissionsManage,
  validate(updateEmployeeSchema, "body"),
  controller.updateEmployee,
);
router.put(
  "/users/employees/:employeeId/permissions",
  employeeAuth,
  requirePermissionsManage,
  validate(updateEmployeePermissionSchema, "body"),
  controller.updateEmployeePermission,
);
router.get(
  "/users/customers",
  employeeAuth,
  requireCustomersManage,
  controller.getCustomers,
);
router.get(
  "/users/customers/:customerId",
  employeeAuth,
  requireCustomersManage,
  controller.getCustomerById,
);
router.get(
  "/customers/:customerId/machines",
  employeeAuth,
  requireCustomersManage,
  controller.getCustomerMachines,
);
router.get(
  "/customers/:customerId/parts-requests",
  employeeAuth,
  requireCustomersManage,
  controller.getCustomerPartsRequests,
);

router.get(
  "/customers/:customerId/quote-requests",
  employeeAuth,
  requireCustomersManage,
  controller.getCustomerQuoteRequests,
);

router.post(
  "/customers/:customerId/quote-requests",
  employeeAuth,
  requireCustomersManage,
  controller.createCustomerQuoteRequest,
);

router.get(
  "/customers/:customerId/service-requests",
  employeeAuth,
  requireCustomersManage,
  controller.getCustomerServiceRequests,
);

router.post(
  "/customers/:customerId/service-requests",
  employeeAuth,
  requireCustomersManage,
  controller.createCustomerServiceRequest,
);

router.post(
  "/customers/:customerId/machines",
  employeeAuth,
  requireMachinesAdd,
  requireCustomersManage,
  validate(assignMachineToCustomerSchema, "body"),
  controller.assignMachineToCustomer,
);
router.get(
  "/users/roles",
  employeeAuth,
  requirePermissionsManage,
  controller.getRoles,
);
router.get(
  "/users/departments",
  employeeAuth,
  requirePermissionsManage,
  controller.getDepartments,
);
router.get(
  "/requests/tracking",
  employeeAuth,
  requireTrackingManage,
  (_req, res) =>
    res.json({ success: true, data: { message: "Tracking access granted" } }),
);
router.get("/quotes", employeeAuth, requireQuotesManage, (_req, res) =>
  res.json({ success: true, data: { message: "Quotes access granted" } }),
);
router.get(
  "/machines",
  employeeAuth,
  requireMachinesManage,
  controller.getMachines,
);
router.get(
  "/manuals",
  employeeAuth,
  requireManualsManage,
  controller.getManuals,
);
router.get(
  "/brochures",
  employeeAuth,
  requireBrochuresManage,
  controller.getBrochures,
);
router.post(
  "/manuals/upload",
  employeeAuth,
  requireManualsManage,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadManualFile,
);
router.post(
  "/brochures/upload",
  employeeAuth,
  requireBrochuresManage,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadBrochureFile,
);
router.post(
  "/products/profile-image",
  employeeAuth,
  requireProductsManage,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadProductProfileImage,
);

// Product file management routes
router.post(
  "/products/:productId/manuals",
  employeeAuth,
  requireProductsManage,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadProductManual,
);

router.post(
  "/products/:productId/brochures",
  employeeAuth,
  requireProductsManage,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadProductBrochure,
);

router.post(
  "/products/:productId/images",
  employeeAuth,
  requireProductsManage,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadProductImage,
);

router.post(
  "/products/:productId/videos/upload",
  employeeAuth,
  requireProductsManage,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadProductVideo,
);

router.post(
  "/products/:productId/videos",
  employeeAuth,
  requireProductsManage,
  controller.addProductVideo,
);

router.post(
  "/products/:productId/specifications",
  employeeAuth,
  requireProductsManage,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadProductSpecification,
);

router.delete(
  "/products/:productId/manuals/:manualId",
  employeeAuth,
  requireProductsManage,
  controller.deleteProductManual,
);

router.delete(
  "/products/:productId/brochures/:brochureId",
  employeeAuth,
  requireProductsManage,
  controller.deleteProductBrochure,
);

router.delete(
  "/products/:productId/images/:imageId",
  employeeAuth,
  requireProductsManage,
  controller.deleteProductImage,
);

router.delete(
  "/products/:productId/videos/:videoId",
  employeeAuth,
  requireProductsManage,
  controller.deleteProductVideo,
);

router.delete(
  "/products/:productId/specifications/:specId",
  employeeAuth,
  requireProductsManage,
  controller.deleteProductSpecification,
);

// Admin machine creation
router.post(
  "/machines",
  employeeAuth,
  requireMachinesAdd,
  validate(addMachineAdminProductSchema, "body"),
  addMachineForAdmin,
);
router.post(
  "/machines/:machineId/assets",
  employeeAuth,
  requireMachinesAdd,
  validate(addMachineAssetsSchema, "body"),
  addMachineAssetsForAdmin,
);

router.post(
  "/gallery/upload",
  employeeAuth,
  requireMachinesAdd,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadGalleryImage,
);

router.post(
  "/videos/upload",
  employeeAuth,
  requireMachinesAdd,
  upload.single("file"),
  multerErrorHandler,
  controller.uploadMachineVideo,
);

router.get("/settings", employeeAuth, controller.getSettings);
router.put("/settings", employeeAuth, controller.updateSettings);
router.get(
  "/employees/service",
  employeeAuth,
  controller.getServiceDepartmentEmployees,
);

export default router;
