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
// Body: { contractId, expectedMoveOutDate, reason }
router.post("/", authenticate, moveOutRequestController.createMoveOutRequest);

// Tenant lấy yêu cầu trả phòng của mình
// GET /api/move-outs/my/:contractId
router.get("/my/:contractId", authenticate, moveOutRequestController.getMyMoveOutRequest);

// Tenant tạo payment ticket (thanh toán online)
// POST /api/move-outs/:moveOutRequestId/pay-online
router.post("/:moveOutRequestId/pay-online", authenticate, moveOutRequestController.createOnlinePaymentTicket);

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

// [STEP 5] Manager hoàn tất trả phòng → terminate contract + inactive tenant
// PUT /api/move-outs/:moveOutRequestId/complete
// Body: { managerCompletionNotes }
router.put("/:moveOutRequestId/complete", authenticate, moveOutRequestController.completeMoveOut);

// ============================================================================
// ACCOUNTANT ROUTES
// ============================================================================

// [STEP 4b] Kế toán xác nhận thanh toán offline
// PUT /api/move-outs/:moveOutRequestId/confirm-payment
// Body: { accountantNotes }
router.put("/:moveOutRequestId/confirm-payment", authenticate, moveOutRequestController.confirmPaymentOffline);

// ============================================================================
// SYSTEM / SHARED ROUTES
// ============================================================================

// So sánh tiền cọc vs hóa đơn cuối
// GET /api/move-outs/:moveOutRequestId/deposit-vs-invoice
router.get("/:moveOutRequestId/deposit-vs-invoice", authenticate, moveOutRequestController.getDepositVsInvoice);

// Callback sau khi thanh toán online thành công (VNPay webhook hoặc FE gọi sau redirect)
// PUT /api/move-outs/:moveOutRequestId/payment-success
// Body: { transactionCode }
router.put("/:moveOutRequestId/payment-success", authenticate, moveOutRequestController.handleOnlinePaymentSuccess);

module.exports = router;
