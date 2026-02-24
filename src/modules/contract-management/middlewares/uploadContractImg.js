const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// Cấu hình Cloudinary (Dùng chung biến môi trường đã có)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

// Cấu hình Storage cho ảnh hợp đồng
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'contract_images', // Thư mục riêng trên Cloudinary cho ảnh hợp đồng
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    },
});

// Khởi tạo Multer
const upload = multer({ storage: storage });

module.exports = upload;
