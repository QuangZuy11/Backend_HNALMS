const express = require("express");
const router = express.Router();
const requestController = require("../controllers/request.controller");
const { authenticate } = require("../../authentication/middlewares/authenticate");
const { authorize } = require("../../authentication/middlewares/authorize");

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
 * Cập nhật trạng thái yêu cầu sửa chữa
 * PUT /api/requests/repair/:requestId/status
 * Chỉ dành cho role manager
 */
router.put(
  "/repair/:requestId/status",
  authenticate,
  authorize("manager"),
  requestController.updateRepairStatus
);

module.exports = router;
