const cron = require("node-cron");
const notificationService = require("../../notification-management/services/notification.service");

const invoiceOverdueJob = () => {
    // Chạy mỗi phút
    cron.schedule("* * * * *", async () => {
        console.log("[INVOICE OVERDUE JOB] ⏱️ Bắt đầu job kiểm tra hóa đơn quá hạn...");
        try {
            const result = await notificationService.checkAndSendOverdueNotifications();
            console.log(`[INVOICE OVERDUE JOB] ✅ Hoàn thành! Đã gửi ${result.sent} thông báo quá hạn`);
        } catch (error) {
            console.error("[INVOICE OVERDUE JOB] ❌ Lỗi khi gửi thông báo quá hạn:", error.message);
        }
    });

    console.log("[INVOICE OVERDUE JOB] ✅ Cron job đã được lên lịch:");
    console.log("  - Kiểm tra hóa đơn quá hạn: Mỗi phút (mỗi 1 phút) xuyên suốt");
};

module.exports = { invoiceOverdueJob };
