require("dotenv").config();
const app = require("./src/app");
const emailService = require("./src/modules/notification-management/services/email.service");
const { startDepositExpirationJob } = require("./src/shared/jobs/deposit-expiration.job");
const contractStartJob = require("./src/modules/contract-management/jobs/contract-start.job");
const { contractRenewalJob } = require("./src/modules/contract-management/jobs/contract-renewal.job");
const bookingRequestExpirationJob = require("./src/modules/contract-management/jobs/booking-request-expiration.job");
// const { startReconciliationJob } = require("./src/shared/services/sepay-reconciliation.service");

const PORT = process.env.PORT || 9999;

app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 API : http://localhost:${PORT}/api`);
    // Kiểm tra cấu hình email (SMTP) khi khởi động
    await emailService.verifyEmailConfig();
    // Start cron jobs
    startDepositExpirationJob();
    contractStartJob();
    contractRenewalJob();
    bookingRequestExpirationJob();
    // Reconciliation service tạm thời disabled - uncomment sau khi có SEPAY_API_TOKEN
    // const reconInterval = parseInt(process.env.RECONCILIATION_INTERVAL_MINUTES || "5", 10);
    // startReconciliationJob(reconInterval * 60 * 1000);
});