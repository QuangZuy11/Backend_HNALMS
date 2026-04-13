const express = require("express");
const router = express.Router();
const depositRoomController = require("../controllers/deposit-room.controller");
// API quản lý deposit cho admin/manager (từ contract-management/controllers/deposit.controller.js)
const depositAdminController = require("../../contract-management/controllers/deposit.controller");

// ===========================================================
// Public routes (khách đặt cọc online)
// ===========================================================

// POST /api/deposits/initiate
// Khách điền form → nhận QR code chuyển khoản
router.post("/initiate", depositRoomController.initiateDeposit);

// GET /api/deposits/status/:transactionCode
// FE polling kiểm tra trạng thái thanh toán
router.get("/status/:transactionCode", depositRoomController.getDepositStatus);

// POST /api/deposits/cancel/:transactionCode
// FE gọi khi user đóng modal thanh toán (hủy giao dịch)
router.post("/cancel/:transactionCode", depositRoomController.cancelDeposit);

// ===========================================================
// Admin/Manager routes (quản lý deposit nội bộ)
// QUAN TRỌNG: Routes cụ thể phải đứng TRƯỚC "/:id"
// ===========================================================

// GET /api/deposits — Lấy tất cả deposits
router.get("/", depositAdminController.getAllDeposits);

// POST /api/deposits — Tạo cọc trực tiếp (không qua thanh toán Sepay)
router.post("/", depositAdminController.createDeposit);

// GET /api/deposits/:id — Lấy deposit theo ID
router.get("/:id", depositAdminController.getDepositById);

// ⚠️ Webhook Sepay đã chuyển sang endpoint chung: POST /api/webhook/sepay
// Xem: src/shared/routes/sepay-webhook.routes.js

module.exports = router;
