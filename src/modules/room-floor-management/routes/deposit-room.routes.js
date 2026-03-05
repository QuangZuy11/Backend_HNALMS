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

// ⚠️ Webhook Sepay đã chuyển sang endpoint chung: POST /api/webhook/sepay
// Xem: src/shared/routes/sepay-webhook.routes.js

module.exports = router;
