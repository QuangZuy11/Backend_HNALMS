const mongoose = require('mongoose');
const dns = require('dns'); // Thêm thư viện dns của Node.js
require('dotenv').config();

// Ép Node.js sử dụng DNS của Google để phân giải chuỗi srv
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            // family: 4 giúp ưu tiên kết nối qua IPv4, tránh lỗi trên mạng Việt Nam
            family: 4, 
        });
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error("❌ MongoDB connection failed: ", error);
        
        // Gợi ý thêm nếu vẫn lỗi
        if (error.message.includes('ECONNREFUSED')) {
            console.log('💡 Mẹo: Kiểm tra lại xem IP hiện tại đã được whitelist trên MongoDB Atlas chưa.');
        }
        
        process.exit(1);
    }
};

module.exports = connectDB;