/**
 * Router quản lý các route liên quan đến nội quy tòa nhà
 */
const express = require("express");
const router = express.Router();
const rulesController = require("../controllers/rules.controller");

// Route công khai - Lấy nội quy đang hiển thị (không cần xác thực)
router.get("/rules/active", rulesController.getActiveRules);

// Phát triển: Cho phép tất cả thao tác CRUD không cần auth (ẩn đi khi production)
router.get("/rules", rulesController.getAllRules);
router.get("/rules/:id", rulesController.getRuleById);
router.post("/rules", rulesController.createRules);
router.put("/rules/:id", rulesController.updateRules);
router.delete("/rules/:id", rulesController.deleteRules);

// Bỏ comment các dòng dưới đây khi đã sẵn sàng xác thực:
// const { authenticate } = require('../../authentication/middlewares/authenticate');
// const { authorize } = require('../../authentication/middlewares/authorize');
//
// router.get('/rules', authenticate, authorize(['admin', 'manager']), rulesController.getAllRules);
// router.get('/rules/:id', authenticate, authorize(['admin', 'manager']), rulesController.getRuleById);
// router.post('/rules', authenticate, authorize(['admin', 'manager']), rulesController.createRules);
// router.put('/rules/:id', authenticate, authorize(['admin', 'manager']), rulesController.updateRules);
// router.delete('/rules/:id', authenticate, authorize(['admin']), rulesController.deleteRules);

module.exports = router;
