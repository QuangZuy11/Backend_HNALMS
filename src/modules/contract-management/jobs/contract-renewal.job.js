const cron = require("node-cron");
const { checkAndSendRenewalNotifications } = require("../services/contract-renewal.service");

/**
 * Cron Job: Gửi thông báo gia hạn hợp đồng
 * Chạy mỗi 1 phút để test
 * NOTE: Đổi lại thành "0 9 * * *" (mỗi ngày lúc 9:00) khi deploy production
 */
const contractRenewalJob = () => {
    // Chạy mỗi 1 phút (dùng để test)
    cron.schedule("* * * * *", async () => {
        console.log("[CONTRACT RENEWAL JOB] ⏱️ Bắt đầu job kiểm tra gia hạn hợp đồng...");
        try {
            await checkAndSendRenewalNotifications();
            console.log("[CONTRACT RENEWAL JOB] ✅ Job kiểm tra gia hạn hợp đồng hoàn thành");
        } catch (error) {
            console.error("[CONTRACT RENEWAL JOB] ❌ Lỗi khi chạy job gia hạn hợp đồng:", error.message);
        }
    });

    console.log("[CONTRACT RENEWAL JOB] ✅ Cron job đã được lên lịch: Chạy mỗi 1 phút (TEST MODE)");
};

// Chạy ngay lần đầu (sau khi server khởi động 30 giây) - dùng để test
const contractRenewalJobInitialRun = (delayMs = 30000) => {
    setTimeout(async () => {
        console.log("[CONTRACT RENEWAL JOB] 🔔 Chạy kiểm tra gia hạn hợp đồng lần đầu...");
        try {
            await checkAndSendRenewalNotifications();
            console.log("[CONTRACT RENEWAL JOB] ✅ Kiểm tra gia hạn hợp đồng lần đầu hoàn thành");
        } catch (error) {
            console.error("[CONTRACT RENEWAL JOB] ❌ Lỗi khi chạy kiểm tra gia hạn lần đầu:", error.message);
        }
    }, delayMs);
};

module.exports = {
    contractRenewalJob,
    contractRenewalJobInitialRun
};
