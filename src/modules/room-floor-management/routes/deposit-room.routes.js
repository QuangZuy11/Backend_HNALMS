const express = require("express");
const router = express.Router();
const depositRoomController = require("../controllers/deposit-room.controller");

// POST /api/deposits/initiate
// Khách điền form → nhận QR code chuyển khoản
router.post("/initiate", depositRoomController.initiateDeposit);

// GET /api/deposits/status/:transactionCode
// FE polling kiểm tra trạng thái thanh toán
router.get("/status/:transactionCode", depositRoomController.getDepositStatus);

// POST /api/deposits/cancel/:transactionCode
// FE gọi khi user đóng modal thanh toán (hủy giao dịch)
router.post("/cancel/:transactionCode", depositRoomController.cancelDeposit);

// POST /api/deposits/webhook/sepay
// Sepay gọi vào đây khi phát hiện biến động số dư
// Route này KHÔNG cần authenticate (Sepay gọi từ bên ngoài)
// Bảo mật bằng SEPAY_WEBHOOK_TOKEN trong header Authorization
router.post("/webhook/sepay", depositRoomController.sepayWebhook);

module.exports = router;
