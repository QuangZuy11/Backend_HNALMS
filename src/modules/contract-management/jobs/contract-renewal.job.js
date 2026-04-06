const cron = require("node-cron");
const { checkAndSendRenewalNotifications } = require("../services/contract-renewal.service");
const Contract = require("../models/contract.model");
const Notification = require("../../notification-management/models/notification.model");
const User = require("../../authentication/models/user.model");

const contractRenewalJob = () => {
    cron.schedule("0 9 * * *", async () => {
        console.log("[CONTRACT RENEWAL JOB] ⏱️ Bắt đầu job gửi thông báo gia hạn...");
        try {
            await checkAndSendRenewalNotifications();
            console.log("[CONTRACT RENEWAL JOB] ✅ Job thông báo gia hạn hoàn thành");
        } catch (error) {
            console.error("[CONTRACT RENEWAL JOB] ❌ Lỗi khi gửi thông báo gia hạn:", error.message);
        }
    });

    cron.schedule("5 0 * * *", async () => {
        console.log("[CONTRACT EXPIRY JOB] ⏱️ Bắt đầu job xử lý hết hạn...");
        try {
            await checkAndProcessExpiredContracts();
            console.log("[CONTRACT EXPIRY JOB] ✅ Job xử lý hết hạn hoàn thành");
        } catch (error) {
            console.error("[CONTRACT EXPIRY JOB] ❌ Lỗi khi xử lý hết hạn:", error.message);
        }
    });

    console.log("[CONTRACT RENEWAL JOB] ✅ Cron jobs đã được lên lịch:");
    console.log("  - Gửi thông báo: Mỗi ngày lúc 9:00 AM");
    console.log("  - Xử lý hết hạn: Mỗi ngày lúc 00:05");
};

async function checkAndProcessExpiredContracts() {
    console.log("[CONTRACT EXPIRY] Bắt đầu kiểm tra hết hạn...");

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setUTCHours(23, 59, 59, 999);

    const expiringContracts = await Contract.find({
        status: "active",
        endDate: { $gte: today, $lte: todayEnd }
    }).populate("tenantId").populate("roomId", "name");

    console.log(`[CONTRACT EXPIRY] Tìm thấy ${expiringContracts.length} hợp đồng hết hạn hôm nay`);

    let expiredCount = 0;

    for (const contract of expiringContracts) {
        if (contract.renewalStatus === "declined") {
            contract.status = "expired";
            await contract.save();
            expiredCount++;
            console.log(`[CONTRACT EXPIRY] Contract ${contract.contractCode} đã hết hạn (đã từ chối gia hạn)`);

            const roomName = contract.roomId?.name || "";
            const managers = await User.find({ role: "manager", status: "active" }).select("_id");

            if (managers.length > 0) {
                const notification = new Notification({
                    title: `Hợp đồng hết hạn — ${roomName}`,
                    content: `Hợp đồng ${contract.contractCode} (phòng ${roomName}) đã hết hạn. Người thuê đã từ chối gia hạn. Vui lòng liên hệ người thuê để trả phòng.`,
                    type: "system",
                    status: "sent",
                    created_by: null,
                    recipients: managers.map((m) => ({
                        recipient_id: m._id,
                        recipient_role: "manager",
                        is_read: false
                    }))
                });
                await notification.save();
            }

            if (contract.tenantId) {
                const tenantNoti = new Notification({
                    title: `Hợp đồng hết hạn — ${roomName}`,
                    content: `Hợp đồng ${contract.contractCode} (phòng ${roomName}) đã hết hạn. Bạn đã từ chối gia hạn, vui lòng liên hệ Quản Lý để trả phòng đúng hạn.`,
                    type: "system",
                    status: "sent",
                    created_by: null,
                    recipients: [{
                        recipient_id: contract.tenantId._id || contract.tenantId,
                        recipient_role: "tenant",
                        is_read: false
                    }]
                });
                await tenantNoti.save();
            }
        } else {
            console.log(`[CONTRACT EXPIRY] Contract ${contract.contractCode} đến hạn nhưng chưa từ chối → vẫn active`);
        }
    }

    console.log(`[CONTRACT EXPIRY] Hoàn thành: ${expiredCount} hợp đồng đã hết hạn`);
    return { expiredCount };
}

const contractRenewalJobInitialRun = (delayMs = 30000) => {
    setTimeout(async () => {
        console.log("[CONTRACT RENEWAL JOB] 🔔 Chạy kiểm tra gia hạn lần đầu...");
        try {
            await checkAndSendRenewalNotifications();
            console.log("[CONTRACT RENEWAL JOB] ✅ Kiểm tra gia hạn lần đầu hoàn thành");
        } catch (error) {
            console.error("[CONTRACT RENEWAL JOB] ❌ Lỗi khi kiểm tra gia hạn lần đầu:", error.message);
        }
    }, delayMs);
};

module.exports = {
    contractRenewalJob,
    contractRenewalJobInitialRun
};
