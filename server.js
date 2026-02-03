require("dotenv").config();
const app = require("./src/app");
const emailService = require("./src/modules/notification-management/services/email.service");

const PORT = process.env.PORT || 9999;

app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 API Documentation: http://localhost:${PORT}/api`);
    console.log(`🧪 Test DB: http://localhost:${PORT}/test-db`);
    // Kiểm tra cấu hình email (SMTP) khi khởi động
    await emailService.verifyEmailConfig();
});