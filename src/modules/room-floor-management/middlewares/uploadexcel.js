// src/middlewares/uploadExcel.js
const multer = require('multer');

// 1. Dùng memoryStorage (Lưu vào RAM) để Service đọc được dữ liệu ngay
const storage = multer.memoryStorage();

// 2. Bộ lọc chỉ chấp nhận Excel
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.includes('excel') || 
    file.mimetype.includes('spreadsheetml') || 
    file.originalname.match(/\.(xlsx|xls)$/)
  ) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận file Excel (.xlsx, .xls)!"), false);
  }
};

const uploadExcel = multer({ 
  storage: storage,
  fileFilter: fileFilter
});

module.exports = uploadExcel; // Đây là middleware upload Excel