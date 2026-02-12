const express = require("express");
const router = express.Router();
const deviceController = require("../controllers/device.controller");

// Import middleware bạn đã cung cấp
const uploadExcel = require("../middlewares/uploadexcel"); 

// --- CÁC ROUTE ---

// 1. Lấy danh sách & Tạo mới
router.get("/", deviceController.getAll);
router.post("/", deviceController.create);

// 2. Tải file mẫu (Đặt trước route :id)
router.get("/template", deviceController.downloadTemplate);

// 3. Import Excel
// Sử dụng middleware ở đây. 'file' là tên field trong Form Data gửi lên từ Frontend
router.post("/import", uploadExcel.single("file"), deviceController.importExcel);

// 4. Sửa & Xóa
router.put("/:id", deviceController.update);
router.delete("/:id", deviceController.delete);

module.exports = router;