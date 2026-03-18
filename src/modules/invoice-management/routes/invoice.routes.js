// const express = require("express");
// const router = express.Router();
// const invoiceController = require("../controllers/invoice.controller");
// const invoicePaymentController = require("../controllers/invoice-payment.controller");
// const { authenticate } = require("../../authentication/middlewares");

// router.get("/", invoiceController.getAll);
// router.post("/generate-drafts", invoiceController.generateDrafts); // Tạo hàng loạt
// router.put("/:id/release", invoiceController.release); // Phát hành
// router.get("/tenant/:tenantId", invoiceController.getInvoicesByTenant); // Lấy hóa đơn theo tenant (admin)
// router.get("/my/:id", authenticate, invoiceController.getMyInvoiceById); // Tenant xem chi tiết hóa đơn của mình

// // ─── Sepay QR Payment (Incurred Invoice) ─────────────────────────────────────
// // ⚠️ Webhook Sepay đã chuyển sang endpoint chung: POST /api/webhook/sepay
// // Kiểm tra trạng thái giao dịch (polling FE)
// router.get("/payment/status/:transactionCode", invoicePaymentController.getInvoicePaymentStatus);
// // Hủy giao dịch đang Pending
// router.post("/payment/cancel/:transactionCode", invoicePaymentController.cancelInvoicePayment);
// // Khởi tạo thanh toán → trả về QR
// router.post("/:id/payment/initiate", invoicePaymentController.initiateInvoicePayment);
// // ─────────────────────────────────────────────────────────────────────────────

// router.get("/:id/incurred", invoiceController.getIncurredInvoiceDetail); // Chi tiết hóa đơn phát sinh (Incurred)
// router.post("/:id/incurred/pay", invoiceController.payIncurredInvoice);  // Thanh toán hóa đơn phát sinh (không QR)
// router.get("/:id", invoiceController.getInvoiceById);
// router.put("/:id/pay", invoiceController.markAsPaid);

// module.exports = router;


const express = require("express");
const router = express.Router();

// Import 2 Controller mới đã tách
const invoicePeriodicController = require("../controllers/invoice_periodic.controller");
const invoiceIncurredController = require("../controllers/invoice_incurred.controller");
const invoiceUnifiedController = require("../controllers/invoice-unified.controller");

// Controller thanh toán giữ nguyên
const invoicePaymentController = require("../controllers/invoice-payment.controller");
const { authenticate } = require("../../authentication/middlewares");

// ============================================================================
// 0. NHÓM HÓA ĐƠN UNIFIED (Lấy cả Periodic và Incurred)
// Prefix tự động: /api/invoices
// ============================================================================
router.get("/tenant/:tenantId", invoiceUnifiedController.getInvoicesByTenant);

// ============================================================================
// 1. NHÓM HÓA ĐƠN ĐỊNH KỲ (Tiền thuê phòng hàng tháng)
// Prefix tự động: /api/invoices/periodic
// ============================================================================
const periodicRouter = express.Router();

periodicRouter.get("/", invoicePeriodicController.getAll);
periodicRouter.post("/generate-drafts", invoicePeriodicController.generateDrafts); 
periodicRouter.put("/:id/release", invoicePeriodicController.release); 
periodicRouter.get("/tenant/:tenantId", invoicePeriodicController.getInvoicesByTenant); 
periodicRouter.get("/my/:id", authenticate, invoicePeriodicController.getMyInvoiceById); 
periodicRouter.get("/:id", invoicePeriodicController.getInvoiceById);
periodicRouter.put("/:id/pay", invoicePeriodicController.markAsPaid);


// ============================================================================
// 2. NHÓM HÓA ĐƠN PHÁT SINH (Sửa chữa, đền bù, phạt...)
// Prefix tự động: /api/invoices/incurred
// ============================================================================
const incurredRouter = express.Router();

incurredRouter.get("/", invoiceIncurredController.getAll);
incurredRouter.post("/", invoiceIncurredController.create); // Thêm route tạo thủ công
incurredRouter.put("/:id/release", invoiceIncurredController.release); 
incurredRouter.get("/tenant/:tenantId", invoiceIncurredController.getInvoicesByTenant); 
incurredRouter.get("/my/:id", authenticate, invoiceIncurredController.getMyInvoiceById); 
incurredRouter.get("/next-code", invoiceIncurredController.getNextCode);
incurredRouter.get("/:id", invoiceIncurredController.getInvoiceById);
incurredRouter.put("/:id/pay", invoiceIncurredController.payInvoice); // Gắn với hàm thanh toán phát sinh


// ============================================================================
// 3. NHÓM THANH TOÁN SEPAY QR 
// Prefix tự động: /api/invoices/payment
// ============================================================================
const paymentRouter = express.Router();

// Kiểm tra trạng thái giao dịch (polling FE)
paymentRouter.get("/status/:transactionCode", invoicePaymentController.getInvoicePaymentStatus);
// Hủy giao dịch đang Pending
paymentRouter.post("/cancel/:transactionCode", invoicePaymentController.cancelInvoicePayment);
// Khởi tạo thanh toán → trả về QR (Lưu ý: FE cần truyền thêm tham số type='periodic'|'incurred' ở body để PaymentController biết đường tìm đúng bảng)
paymentRouter.post("/:id/initiate", invoicePaymentController.initiateInvoicePayment);


// ============================================================================
// GẮN CÁC NHÓM VÀO ROUTER CHÍNH
// ============================================================================
router.use("/periodic", periodicRouter);
router.use("/incurred", incurredRouter);
router.use("/payment", paymentRouter);

module.exports = router;