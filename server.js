require("dotenv").config();
const app = require("./src/app");
const emailService = require("./src/modules/notification-management/services/email.service");
const { startDepositExpirationJob } = require("./src/shared/jobs/deposit-expiration.job");

const PORT = process.env.PORT || 9999;

app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 API : http://localhost:${PORT}/api`);
    // Kiểm tra cấu hình email (SMTP) khi khởi động
    await emailService.verifyEmailConfig();
    // Start cron jobs
    startDepositExpirationJob();
});