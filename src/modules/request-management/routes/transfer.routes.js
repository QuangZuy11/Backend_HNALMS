const express = require("express");
const router = express.Router();
const transferController = require("../controllers/transfer_request.controller");
const transferValidator = require("../validators/transfer_request.validator");
const {
  authenticate,
} = require("../../authentication/middlewares/authenticate");
const { authorize } = require("../../authentication/middlewares/authorize");

/**
 * [TENANT] Lấy danh sách phòng trống để chọn chuyển đến
 * GET /api/requests/transfer/available-rooms
 */
router.get(
  "/available-rooms",
  authenticate,
  authorize("Tenant"),
  transferController.getAvailableRoomsForTransfer,
);

/**
 * [TENANT] Xem danh sách yêu cầu chuyển phòng của mình
 * GET /api/requests/transfer/my-requests
 */
router.get(
  "/my-requests",
  authenticate,
  authorize("Tenant"),
  transferController.getMyTransferRequests,
);

/**
 * [MANAGER] Lấy tất cả yêu cầu chuyển phòng
 * GET /api/requests/transfer
 */
router.get(
  "/",
  authenticate,
  authorize("manager"),
  transferController.getAllTransferRequests,
);

/**
 * [TENANT] Tạo yêu cầu chuyển phòng
 * POST /api/requests/transfer
 * Body: { targetRoomId, transferDate, reason }
 */
router.post(
  "/",
  authenticate,
  authorize("Tenant"),
  transferValidator.validateCreateTransferRequestMiddleware,
  transferController.createTransferRequest,
);

/**
 * [MANAGER] Lấy danh sách tất cả yêu cầu chuyển phòng
 * GET /api/requests/transfer
 * Query: ?status=Pending&search=abc&page=1&limit=10
 */
router.get(
  "/",
  authenticate,
  authorize("manager"),
  transferController.getAllTransferRequests
);

/**
 * [MANAGER] Lấy chi tiết yêu cầu chuyển phòng
 * GET /api/requests/transfer/:id
 */
router.get(
  "/:id",
  authenticate,
  transferController.getTransferRequestById
);

/**
 * [MANAGER] Duyệt yêu cầu chuyển phòng
 * PATCH /api/requests/transfer/:id/approve
 */
router.patch(
  "/:id/approve",
  authenticate,
  authorize("manager"),
  transferController.approveTransferRequest
);

/**
 * [MANAGER] Từ chối yêu cầu chuyển phòng
 * PATCH /api/requests/transfer/:id/reject
 */
router.patch(
  "/:id/reject",
  authenticate,
  authorize("manager"),
  transferController.rejectTransferRequest
);

/**
 * [TENANT] Cập nhật yêu cầu chuyển phòng (chỉ khi Pending)
 * PUT /api/requests/transfer/:id
 */
router.put(
  "/:id",
  authenticate,
  authorize("Tenant"),
  transferController.updateTransferRequest
);

/**
 * [TENANT] Xóa yêu cầu chuyển phòng (chỉ khi Pending)
 * DELETE /api/requests/transfer/:id
 */
router.delete(
  "/:id",
  authenticate,
  authorize("Tenant"),
  transferController.deleteTransferRequest
);

/**
 * [TENANT] Hủy yêu cầu chuyển phòng (chỉ khi Pending)
 * PATCH /api/requests/transfer/:id/cancel
 */
router.patch(
  "/:id/cancel",
  authenticate,
  authorize("Tenant"),
  transferController.cancelTransferRequest,
);

/**
 * [MANAGER] Hoàn tất chuyển phòng (Bàn giao phòng)
 * PATCH /api/requests/transfer/:id/complete
 * Thực hiện khi ngày chuyển đã tới
 */
router.patch(
  "/:id/complete",
  authenticate,
  authorize("manager"),
  transferController.completeTransferRequest,
);

module.exports = router;
