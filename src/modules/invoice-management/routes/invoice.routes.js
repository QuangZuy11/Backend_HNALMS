const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoice.controller");
const invoicePaymentController = require("../controllers/invoice-payment.controller");
const { authenticate } = require("../../authentication/middlewares");

router.get("/", invoiceController.getAll);
router.post("/generate-drafts", invoiceController.generateDrafts); // Tạo hàng loạt
router.put("/:id/release", invoiceController.release); // Phát hành
router.get("/tenant/:tenantId", invoiceController.getInvoicesByTenant); // Lấy hóa đơn theo tenant (admin)
router.get("/my/:id", authenticate, invoiceController.getMyInvoiceById); // Tenant xem chi tiết hóa đơn của mình

// ─── Sepay QR Payment (Incurred Invoice) ─────────────────────────────────────
// Webhook Sepay gọi khi có biến động số dư (không cần auth, xác thực bằng ApiKey header)
router.post("/webhook/sepay", invoicePaymentController.sepayWebhookForInvoice);
// Kiểm tra trạng thái giao dịch (polling FE)
router.get("/payment/status/:transactionCode", invoicePaymentController.getInvoicePaymentStatus);
// Hủy giao dịch đang Pending
router.post("/payment/cancel/:transactionCode", invoicePaymentController.cancelInvoicePayment);
// Khởi tạo thanh toán → trả về QR
router.post("/:id/payment/initiate", invoicePaymentController.initiateInvoicePayment);
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/incurred", invoiceController.getIncurredInvoiceDetail); // Chi tiết hóa đơn phát sinh (Incurred)
router.post("/:id/incurred/pay", invoiceController.payIncurredInvoice);  // Thanh toán hóa đơn phát sinh (không QR)
router.get("/:id", invoiceController.getInvoiceById);

module.exports = router;