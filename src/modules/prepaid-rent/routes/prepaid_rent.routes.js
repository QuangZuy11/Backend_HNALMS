const express = require("express");
const router = express.Router();
const { authenticate } = require("../../authentication/middlewares/index");
const prepaidRentController = require("../controllers/prepaid_rent.controller");

// ============================================================
// PREPAID RENT ROUTES - Tenant
// Prefix: /api/prepaid-rent
// ============================================================

// GET /prepaid-rent/contract
// Lấy thông tin hợp đồng đang hoạt động của tenant (để hiển thị form trả trước)
router.get("/contract", authenticate, prepaidRentController.getMyContract);

// POST /prepaid-rent/create
// Tạo yêu cầu trả trước tiền phòng + khởi tạo thanh toán QR
router.post("/create", authenticate, prepaidRentController.createPrepaidRentRequest);

// GET /prepaid-rent/payment-status/:transactionCode
// Poll trạng thái thanh toán (Mobile gọi mỗi 3 giây)
router.get("/payment-status/:transactionCode", prepaidRentController.getPaymentStatus);

// POST /prepaid-rent/cancel/:transactionCode
// Hủy yêu cầu trả trước (user hủy giao dịch)
router.post("/cancel/:transactionCode", authenticate, prepaidRentController.cancelPrepaidRentRequest);

// GET /prepaid-rent/history
// Lấy lịch sử trả trước của tenant
router.get("/history", authenticate, prepaidRentController.getPrepaidRentHistory);

module.exports = router;
