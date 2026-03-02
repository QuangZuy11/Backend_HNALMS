const express = require("express");
const router = express.Router();
const transferController = require("../controllers/transfer_request.controller");
const transferValidator = require("../validators/transfer_request.validator");
const { authenticate } = require("../../authentication/middlewares/authenticate");
const { authorize } = require("../../authentication/middlewares/authorize");

/**
 * [TENANT] Lấy danh sách phòng trống để chọn chuyển đến
 * GET /api/requests/transfer/available-rooms
 */
router.get(
  "/available-rooms",
  authenticate,
  authorize("Tenant"),
  transferController.getAvailableRoomsForTransfer
);

/**
 * [TENANT] Xem danh sách yêu cầu chuyển phòng của mình
 * GET /api/requests/transfer/my-requests
 */
router.get(
  "/my-requests",
  authenticate,
  authorize("Tenant"),
  transferController.getMyTransferRequests
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
  transferController.createTransferRequest
);

/**
 * [TENANT] Hủy yêu cầu chuyển phòng (chỉ khi Pending)
 * PATCH /api/requests/transfer/:id/cancel
 */
router.patch(
  "/:id/cancel",
  authenticate,
  authorize("Tenant"),
  transferController.cancelTransferRequest
);

module.exports = router;
