const express = require("express");
const router = express.Router();
const serviceController = require("../controllers/service.controller");

// Lấy danh sách (có thể filter ?type=Fixed hoặc ?search=abc)
router.get("/", serviceController.getServices);

// Tạo mới
router.post("/", serviceController.createService);

// Cập nhật
router.put("/:id", serviceController.updateService);

// Xóa
router.delete("/:id", serviceController.deleteService);
module.exports = router;