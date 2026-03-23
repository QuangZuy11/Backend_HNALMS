const express = require("express");
const router = express.Router();
const moveOutRequestController = require("../controllers/moveout_request.controller");
const { authenticate } = require("../../authentication/middlewares");

// ============================================================================
// TENANT ROUTES
// ============================================================================

// Lấy thông tin hợp đồng khi ấn nút "Trả phòng"
// GET /api/move-outs/contract/:contractId/info
// Auth: Tenant
router.get("/contract/:contractId/info", authenticate, moveOutRequestController.getContractInfo);

// Tenant tạo yêu cầu trả phòng
// POST /api/move-outs
// Body: { contractId, expectedMoveOutDate, reason }
// Auth: Tenant
router.post("/", authenticate, moveOutRequestController.createMoveOutRequest);

// Tenant lấy yêu cầu trả phòng của mình
// GET /api/move-outs/my/:contractId
// Auth: Tenant
router.get("/my/:contractId", authenticate, moveOutRequestController.getMyMoveOutRequest);

// ============================================================================
// MANAGER ROUTES
// ============================================================================

// Quản lý lấy danh sách yêu cầu trả phòng
// GET /api/move-outs/list?status=Requested&page=1&limit=20
// Auth: Manager
router.get("/list", authenticate, moveOutRequestController.getAllMoveOutRequests);

// Quản lý phê duyệt yêu cầu trả phòng
// PUT /api/move-outs/:moveOutRequestId/approve
// Body: { managerApprovalNotes }
// Auth: Manager
router.put("/:moveOutRequestId/approve", authenticate, moveOutRequestController.approveMoveOutRequest);

// Quản lý xác nhận hoàn tất trả phòng (sau tính hóa đơn thanh lý)
// PUT /api/move-outs/:moveOutRequestId/complete
// Body: { finalSettlementInvoiceId, managerCompletionNotes }
// Auth: Manager
router.put("/:moveOutRequestId/complete", authenticate, moveOutRequestController.completeMoveOut);

// ============================================================================
// SHARED ROUTES
// ============================================================================

// Hủy yêu cầu trả phòng
// DELETE /api/move-outs/:moveOutRequestId
// Auth: Tenant or Manager
router.delete("/:moveOutRequestId", authenticate, moveOutRequestController.cancelMoveOutRequest);

module.exports = router;
