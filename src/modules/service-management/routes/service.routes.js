const express = require("express");
const router = express.Router();
const serviceController = require("../controllers/service.controller");
const { authenticate } = require("../../authentication/middlewares/");
const { authorize } = require("../../authentication/middlewares/");

// Lấy danh sách dịch vụ đã đăng ký của tenant đang đăng nhập
// GET /api/services/my-services
router.get("/my-services", authenticate, authorize("Tenant"), serviceController.getMyBookedServices);

// Lấy danh sách dịch vụ đã đăng ký của một tenant cụ thể (dành cho manager)
// GET /api/services/tenant/:tenantId
router.get("/tenant/:tenantId", authenticate, authorize("manager"), serviceController.getBookedServicesByTenant);

// Lấy danh sách (có thể filter ?type=Fixed hoặc ?search=abc)
router.get("/", serviceController.getServices);

// Tạo mới
router.post("/", serviceController.createService);

// Cập nhật
router.put("/:id", serviceController.updateService);

// Xóa
router.delete("/:id", serviceController.deleteService);
module.exports = router;