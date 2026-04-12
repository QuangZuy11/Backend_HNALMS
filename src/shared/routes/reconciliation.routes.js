const express = require("express");
const router = express.Router();
const reconciliationController = require("../controllers/reconciliation.controller");

/**
 * Reconciliation API Routes
 * 
 * Các endpoint để quản lý reconciliation job và xử lý các giao dịch bị bỏ sót
 * 
 * Lưu ý: Nên bảo vệ các endpoint này bằng middleware xác thực (auth)
 */

// GET /api/reconciliation/status - Kiểm tra trạng thái job
router.get("/status", reconciliationController.getStatus);

// POST /api/reconciliation/run - Chạy reconciliation thủ công
router.post("/run", reconciliationController.runManually);

// GET /api/reconciliation/orphans - Lấy danh sách payment bị orphan
router.get("/orphans", reconciliationController.getOrphanPayments);

// POST /api/reconciliation/process-orphan/:paymentId - Xử lý orphan payment cụ thể
router.post("/process-orphan/:paymentId", reconciliationController.processOrphan);

module.exports = router;
