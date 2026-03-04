const express = require("express");
const router = express.Router();
const requestController = require("../controllers/request.controller");
const requestValidator = require("../validators/request.validator");
const complaintRoutes = require("./complaint.routes");
const transferRoutes = require("./transfer.routes");
const { authenticate } = require("../../authentication/middlewares/authenticate");
const { authorize } = require("../../authentication/middlewares/authorize");
const fileUpload = require("express-fileupload");

const uploadMiddleware = fileUpload({
  useTempFiles: true,
  tempFileDir: "/tmp/",
  limits: { fileSize: 10 * 1024 * 1024 },
  abortOnLimit: true,
  createParentPath: true,
});

// Mount complaint routes
router.use(complaintRoutes);

// Mount transfer room request routes
router.use("/transfer", transferRoutes);

/**
 * Tạo yêu cầu sửa chữa/bảo trì mới
 * POST /api/requests/repair
 * Dành cho tenant
 * Body (multipart/form-data): { devicesId, type, description, images?: File[] }
 * hoặc Body (JSON): { devicesId, type, description, images?: string[] }
 */
router.post(
  "/repair",
  authenticate,
  authorize("Tenant"),
  uploadMiddleware,
  requestValidator.validateCreateRepairRequestMiddleware,
  requestController.createRepairRequest
);

/**
 * Lấy danh sách yêu cầu sửa chữa
 * GET /api/requests/repair
 * Chỉ dành cho role manager
 */
router.get(
  "/repair",
  authenticate,
  authorize("manager"),
  requestController.getRepairRequests
);

/**
 * Lấy invoiceCode kế tiếp cho hóa đơn sửa chữa
 * GET /api/requests/repair/next-invoice-code
 * Chỉ dành cho role manager
 *
 * NOTE: route này phải đặt TRƯỚC /repair/:requestId để tránh bị match nhầm.
 */
router.get(
  "/repair/next-invoice-code",
  authenticate,
  authorize("manager"),
  requestController.getNextRepairInvoiceCode
);

/**
 * Lấy paymentVoucher kế tiếp cho phiếu chi sửa chữa miễn phí
 * GET /api/requests/repair/next-payment-voucher
 * Chỉ dành cho role manager
 */
router.get(
  "/repair/next-payment-voucher",
  authenticate,
  authorize("manager"),
  requestController.getNextRepairPaymentVoucher
);

/**
 * Lấy paymentVoucher kế tiếp cho phiếu chi bảo trì
 * GET /api/requests/maintenance/next-payment-voucher
 * Chỉ dành cho role manager
 */
router.get(
  "/maintenance/next-payment-voucher",
  authenticate,
  authorize("manager"),
  requestController.getNextMaintenancePaymentVoucher
);

/**
 * Lấy danh sách yêu cầu sửa chữa của tenant hiện tại
 * GET /api/requests/repair/my-requests
 * Dành cho tenant
 */
router.get(
  "/repair/my-requests",
  authenticate,
  authorize("Tenant"),
  requestController.getMyRepairRequests
);

/**
 * Lấy chi tiết yêu cầu sửa chữa theo ID
 * GET /api/requests/repair/:requestId
 * Dành cho manager và tenant (tenant chỉ xem của mình)
 */
router.get(
  "/repair/:requestId",
  authenticate,
  requestController.getRepairRequestById
);

/**
 * Cập nhật yêu cầu sửa chữa (tenant, chỉ khi Pending)
 * PUT /api/requests/repair/:requestId
 * Body (multipart/form-data): { type?, devicesId?, description?, images?: File[] }
 * hoặc Body (JSON): { type?, devicesId?, description?, images?: string[] }
 */
router.put(
  "/repair/:requestId",
  authenticate,
  authorize("Tenant"),
  uploadMiddleware,
  requestValidator.validateUpdateRepairRequestMiddleware,
  requestController.updateRepairRequest
);

/**
 * Cập nhật trạng thái yêu cầu sửa chữa
 * PUT /api/requests/repair/:requestId/status
 * Chỉ dành cho role manager
 * Body: { status: "Pending"|"Processing"|"Done"|"Unpaid"|"Paid", notes?, invoiceCode?, ... }
 */
router.put(
  "/repair/:requestId/status",
  authenticate,
  authorize("manager"),
  requestController.updateRepairStatus
);

/**
 * Xóa yêu cầu sửa chữa
 * DELETE /api/requests/repair/:requestId
 * Dành cho manager hoặc tenant (tenant chỉ xóa của mình, status Pending)
 */
router.delete(
  "/repair/:requestId",
  authenticate,
  requestController.deleteRepairRequest
);

module.exports = router;
