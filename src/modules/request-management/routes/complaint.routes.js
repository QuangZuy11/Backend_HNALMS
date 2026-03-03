/**
 * Complaint Request Routes
 * Định nghĩa endpoints cho khiếu nại từ mobile frontend
 */

const express = require("express");
const router = express.Router();
const complaintController = require("../controllers/complaint.controller");
const complaintValidator = require("../validators/complaint.validator");
const { authenticate } = require("../../authentication/middlewares/");

/**
 * POST /api/requests/complaints
 * Tạo yêu cầu khiếu nại mới
 * Body: {content, category}
 */
router.post(
  "/complaints",
  authenticate,
  complaintValidator.validateCreateComplaintMiddleware,
  complaintController.createComplaint
);

/**
 * GET /api/requests/complaints
 * Lấy danh sách khiếu nại
 * Query: ?status=Pending&category=Tiếng ồn&page=1&limit=10
 */
router.get(
  "/complaints",
  authenticate,
  complaintController.getComplaintList
);

/**
 * GET /api/requests/complaints/:id
 * Lấy chi tiết khiếu nại theo ID
 */
router.get(
  "/complaints/:id",
  authenticate,
  complaintController.getComplaintById
);

/**
 * PUT /api/requests/complaints/:id
 * Cập nhật khiếu nại (chỉ tenant, chỉ khi Pending)
 * Body: {content, category}
 */
router.put(
  "/complaints/:id",
  authenticate,
  complaintValidator.validateUpdateComplaintMiddleware,
  complaintController.updateComplaint
);

/**
 * PUT /api/requests/complaints/:id/status
 * Cập nhật trạng thái khiếu nại (chỉ manager/admin)
 * Body: {status, response}
 */
router.put(
  "/complaints/:id/status",
  authenticate,
  complaintValidator.validateUpdateStatusMiddleware,
  complaintController.updateComplaintStatus
);

/**
 * DELETE /api/requests/complaints/:id
 * Xóa khiếu nại (chỉ tenant, chỉ khi Pending)
 */
router.delete(
  "/complaints/:id",
  authenticate,
  complaintController.deleteComplaint
);

/**
 * GET /api/requests/complaints/stats/dashboard
 * Lấy thống kê khiếu nại
 */
router.get(
  "/complaints/stats/dashboard",
  authenticate,
  complaintController.getComplaintStats
);

module.exports = router;
