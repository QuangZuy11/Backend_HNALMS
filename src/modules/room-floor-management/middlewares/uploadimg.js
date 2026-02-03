const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// 1. Cấu hình Cloudinary (Lấy từ Dashboard Cloudinary của bạn)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// 2. Cấu hình Storage (Nơi lưu và cách đặt tên file)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'room_types', // Tên thư mục trên Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'], // Định dạng cho phép
    // transformation: [{ width: 500, height: 500, crop: 'limit' }], // (Tùy chọn) Resize ảnh ngay khi up
  },
});

// 3. Khởi tạo Multer
const upload = multer({ storage: storage });

module.exports = upload;