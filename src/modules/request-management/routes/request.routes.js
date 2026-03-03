const express = require("express");
const router = express.Router();
const requestController = require("../controllers/request.controller");
const requestValidator = require("../validators/request.validator");
const complaintRoutes = require("./complaint.routes");
const transferRoutes = require("./transfer.routes");
const { authenticate } = require("../../authentication/middlewares/authenticate");
const { authorize } = require("../../authentication/middlewares/authorize");

// Mount complaint routes
router.use(complaintRoutes);

// Mount transfer room request routes
router.use("/transfer", transferRoutes);

/**
 * Tạo yêu cầu sửa chữa/bảo trì mới
 * POST /api/requests/repair
 * Dành cho tenant
 * Body: { devicesId, type, description, images? }
 */
router.post(
  "/repair",
  authenticate,
  authorize("Tenant"),
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
