const express = require("express");
const router = express.Router();
const serviceController = require("../controllers/service.controller");
const { authenticate } = require("../../authentication/middlewares/");
const { authorize } = require("../../authentication/middlewares/");

// Lấy danh sách dịch vụ đã đăng ký của tenant đang đăng nhập
// GET /api/services/my-services?contractId={contractId}
// Query: contractId (optional - nếu không có sẽ dùng active contract)
router.get("/my-services", authenticate, authorize("Tenant"), serviceController.getMyBookedServices);

// Lấy toàn bộ dịch vụ với trạng thái book cho Service List Screen
// GET /api/services/list?contractId={contractId}
// Query: contractId (optional - nếu không có sẽ dùng active contract)
router.get("/list", authenticate, authorize("Tenant"), serviceController.getAllServicesForTenant);

// Đăng ký dịch vụ Extension
// POST /api/services/book
// Body: { serviceId, quantity, contractId(optional) }
router.post("/book", authenticate, authorize("Tenant"), serviceController.bookService);

// Huỷ đăng ký dịch vụ Extension (cập nhật endDate = now, không xoá)
// PATCH /api/services/book/:serviceId/cancel?contractId={contractId}
// Query: contractId (optional - nếu không có sẽ dùng active contract)
router.patch("/book/:serviceId/cancel", authenticate, authorize("Tenant"), serviceController.cancelBookedService);

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