const express = require("express");
const router = express.Router();
const moveOutRequestController = require("../controllers/moveout_request.controller");
const { authenticate } = require("../../authentication/middlewares");

// ============================================================================
// TENANT ROUTES
// ============================================================================

// Lấy thông tin hợp đồng khi ấn nút "Trả phòng"
// GET /api/move-outs/contract/:contractId/info
router.get("/contract/:contractId/info", authenticate, moveOutRequestController.getContractInfo);

// Tenant tạo yêu cầu trả phòng
// POST /api/move-outs
// Body: { contractId, expectedMoveOutDate, reason, confirmContinue? }
router.post("/", authenticate, moveOutRequestController.createMoveOutRequest);

// Tenant lấy yêu cầu trả phòng của mình
// GET /api/move-outs/my/:contractId
router.get("/my/:contractId", authenticate, moveOutRequestController.getMyMoveOutRequest);



// ============================================================================
// MANAGER ROUTES
// ============================================================================

// Lấy danh sách yêu cầu trả phòng
// GET /api/move-outs/list?status=Requested&page=1&limit=20
router.get("/list", authenticate, moveOutRequestController.getAllMoveOutRequests);

// Lấy chi tiết một yêu cầu trả phòng
// GET /api/move-outs/:moveOutRequestId
router.get("/:moveOutRequestId", authenticate, moveOutRequestController.getMoveOutRequestById);

// [STEP 2] Manager phát hành hóa đơn cuối sau khi kiểm tra phòng
// POST/PUT /api/move-outs/:moveOutRequestId/release-invoice
// Body: { managerInvoiceNotes, electricIndex, waterIndex }
router.post("/:moveOutRequestId/release-invoice", authenticate, moveOutRequestController.releaseFinalInvoice);
router.put("/:moveOutRequestId/release-invoice", authenticate, moveOutRequestController.releaseFinalInvoice);

// [STEP 3] Manager xác nhận hoàn tất trả phòng
// PATCH/PUT /api/move-outs/:moveOutRequestId/complete
// Body: { managerCompletionNotes }
router.patch("/:moveOutRequestId/complete", authenticate, moveOutRequestController.completeMoveOut);
router.put("/:moveOutRequestId/complete", authenticate, moveOutRequestController.completeMoveOut);

// ============================================================================
// ACCOUNTANT ROUTES
// ============================================================================

// ============================================================================
// SYSTEM / SHARED ROUTES
// ============================================================================

// So sánh tiền cọc vs hóa đơn cuối
// GET /api/move-outs/:moveOutRequestId/deposit-vs-invoice
router.get("/:moveOutRequestId/deposit-vs-invoice", authenticate, moveOutRequestController.getDepositVsInvoice);

module.exports = router;
