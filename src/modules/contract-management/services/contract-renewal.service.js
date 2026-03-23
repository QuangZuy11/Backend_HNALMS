const mongoose = require("mongoose");
const Contract = require("../models/contract.model");
const Notification = require("../../notification-management/models/notification.model");
const ContractNotificationLog = require("../models/contract-notification-log.model");

// Cấu hình các mốc thời gian gửi notification
const REMINDER_CONFIGS = [
    { type: "1_month", days: 30 },
    { type: "2_weeks", days: 14 },
    { type: "1_week", days: 7 }
];

/**
 * Check và gửi notification gia hạn hợp đồng
 * Chạy mỗi ngày để kiểm tra các contract sắp hết hạn
 */
async function checkAndSendRenewalNotifications() {
    console.log("[CONTRACT RENEWAL] 🔔 Bắt đầu kiểm tra gia hạn hợp đồng...");

    // Sử dụng thời gian UTC để tránh timezone issues
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Query contracts active sắp hết hạn (trong vòng 60 ngày - mở rộng để test)
    const maxDays = 60;
    const maxDate = new Date(today.getTime() + maxDays * 24 * 60 * 60 * 1000);

    console.log(`[CONTRACT RENEWAL] Today: ${today.toISOString()}`);
    console.log(`[CONTRACT RENEWAL] Max Date (${maxDays} days): ${maxDate.toISOString()}`);

    const contracts = await Contract.find({
        status: "active",
        endDate: {
            $gte: today,
            $lte: maxDate
        }
    }).populate("tenantId").populate("roomId", "name");

    console.log(`[CONTRACT RENEWAL] Tìm thấy ${contracts.length} hợp đồng sắp hết hạn`);

    // Debug: log chi tiết các contract tìm thấy
    for (const c of contracts) {
        console.log(`[CONTRACT RENEWAL] Contract: ${c.contractCode}, endDate: ${c.endDate}`);
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const contract of contracts) {
        // Kiểm tra tenantId có tồn tại không
        if (!contract.tenantId) {
            console.warn(`[CONTRACT RENEWAL] ⚠️ Contract ${contract.contractCode} không có tenantId`);
            continue;
        }

        for (const config of REMINDER_CONFIGS) {
            // Tính ngày cần gửi notification (sử dụng UTC)
            const targetDate = new Date(contract.endDate);
            targetDate.setUTCDate(targetDate.getUTCDate() - config.days);
            targetDate.setUTCHours(0, 0, 0, 0);

            // Nếu hôm nay >= ngày cần gửi thì gửi
            if (today.getTime() >= targetDate.getTime()) {
                console.log(`[CONTRACT RENEWAL] Target date for ${config.type}: ${targetDate.toISOString()}, Today: ${today.toISOString()}`);
                const result = await sendRenewalNotification(contract, config);
                if (result) {
                    sentCount++;
                } else {
                    skippedCount++;
                }
            }
        }
    }

    console.log(`[CONTRACT RENEWAL] ✅ Hoàn thành: Đã gửi ${sentCount} notification, bỏ qua ${skippedCount} notification đã gửi trước đó`);
}

/**
 * Gửi notification gia hạn cho một contract cụ thể
 */
async function sendRenewalNotification(contract, config) {
    try {
        // 1. Tạo log TRƯỚC để tránh race condition (findOneAndUpdate với upsert)
        // Sử dụng updateOne với upsert để đảm bảo chỉ tạo 1 lần (atomic)
        const logResult = await ContractNotificationLog.updateOne(
            {
                contractId: contract._id,
                reminderType: config.type
            },
            {
                $setOnInsert: {
                    contractId: contract._id,
                    tenantId: contract.tenantId._id,
                    reminderType: config.type,
                    sentAt: new Date()
                }
            },
            { upsert: true }
        );

        // Nếu document đã tồn tại (matched > 0), không cần gửi lại
        if (logResult.matchedCount > 0) {
            console.log(`[CONTRACT RENEWAL] ⏭️ Notification ${config.type} đã gửi cho contract ${contract.contractCode}`);
            return false;
        }

        // 2. Tạo notification (hệ thống không cần created_by)
        const roomName = contract.roomId?.name || "Unknown";
        const title = `Thông báo gia hạn hợp đồng - ${roomName}`;
        const content = `Hợp đồng thuê phòng ${contract.contractCode} sẽ hết hạn sau ${config.days} ngày (${formatDate(contract.endDate)}). Vui lòng liên hệ Quản Lý để gia hạn hoặc truy cập vào mục Gia Hạn Hợp Đồng trên ứng dụng. Xin Cảm Ơn !`;

        const notification = new Notification({
            title: title,
            content: content,
            type: "system",
            status: "sent",
            created_by: null, // Notification từ hệ thống
            recipients: [{
                recipient_id: contract.tenantId._id,
                recipient_role: "tenant",
                is_read: false
            }]
        });

        await notification.save();

        // 3. Cập nhật log với notificationId
        await ContractNotificationLog.updateOne(
            {
                contractId: contract._id,
                reminderType: config.type
            },
            {
                $set: {
                    notificationId: notification._id
                }
            }
        );

        console.log(`[CONTRACT RENEWAL] ✅ Đã gửi notification ${config.type} cho contract ${contract.contractCode} - Tenant: ${contract.tenantId.fullName || contract.tenantId.email}`);
        return true;

    } catch (error) {
        console.error(`[CONTRACT RENEWAL] ❌ Lỗi gửi notification cho contract ${contract.contractCode}:`, error.message);
        return false;
    }
}

/**
 * Format ngày sang dạng Việt Nam
 */
function formatDate(date) {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

module.exports = {
    checkAndSendRenewalNotifications,
    sendRenewalNotification
};
