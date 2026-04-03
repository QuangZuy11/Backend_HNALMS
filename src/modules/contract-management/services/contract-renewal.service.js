const Contract = require("../models/contract.model");
const Deposit = require("../models/deposit.model");
const Notification = require("../../notification-management/models/notification.model");
const ContractNotificationLog = require("../models/contract-notification-log.model");
const User = require("../../authentication/models/user.model");
const PriceHistory = require("../../room-floor-management/models/pricehistory.model");

// Cấu hình các mốc thời gian gửi notification
const REMINDER_CONFIGS = [
    { type: "1_month", days: 30 },
    { type: "2_weeks", days: 14 },
    { type: "1_week", days: 7 }
];

const RENEWAL_WINDOW_DAYS = 30;
const MIN_EXTENSION_MONTHS = 1;
const MAX_EXTENSION_MONTHS = 24;

function toPriceNumber(value) {
    if (value == null) return 0;
    if (typeof value === "object" && value.$numberDecimal) {
        return parseFloat(value.$numberDecimal);
    }
    if (typeof value === "object" && typeof value.toString === "function") {
        return parseFloat(value.toString()) || 0;
    }
    return Number(value) || 0;
}

function startOfUtcDay(d) {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
}

function daysUntilContractEndUtc(endDate) {
    const today = startOfUtcDay(new Date());
    const end = startOfUtcDay(endDate);
    return Math.floor((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Phòng đã có người đặt cọc / hợp đồng tương lai cho kỳ sau → chặn mở form gia hạn (trừ khi đã trong cửa sổ 30 ngày).
 */
async function hasBlockingReservationForRenewal(contract) {
    const roomId = contract.roomId?._id || contract.roomId;
    const tenantId = contract.tenantId?._id || contract.tenantId;
    if (!roomId || !tenantId) return false;

    const futureOtherTenant = await Contract.findOne({
        roomId,
        status: "active",
        startDate: { $gt: new Date() },
        tenantId: { $ne: tenantId }
    })
        .select("_id")
        .lean();

    if (futureOtherTenant) return true;

    const heldDeposits = await Deposit.find({ room: roomId, status: "Held" }).select("_id").lean();
    const linkedId = contract.depositId ? String(contract.depositId) : null;

    for (const d of heldDeposits) {
        if (linkedId && String(d._id) === linkedId) continue;
        return true;
    }

    return false;
}

/**
 * Theo activity diagram: trong 30 ngày cuối luôn cho xem form; trước đó chỉ cho nếu không có cọc/hợp đồng kỳ sau.
 */
async function assertCanOpenRenewalFlow(contract) {
    const daysLeft = daysUntilContractEndUtc(contract.endDate);
    if (daysLeft < 0) {
        throw new Error("Hợp đồng đã hết hạn, không thể gia hạn.");
    }
    if (contract.status !== "active") {
        throw new Error("Chỉ có thể gia hạn khi hợp đồng đang hiệu lực.");
    }

    const onDeadline = daysLeft <= RENEWAL_WINDOW_DAYS;
    if (onDeadline) return;

    const blocked = await hasBlockingReservationForRenewal(contract);
    if (blocked) {
        throw new Error(
            "Phòng đã có người đặt cọc hoặc hợp đồng cho kỳ tiếp theo. Bạn chỉ có thể gia hạn khi còn trong 30 ngày trước ngày kết thúc hợp đồng."
        );
    }
}

async function getRoomTypePriceAtContractStart(roomTypeId, contractStartDate) {
    if (!roomTypeId || !contractStartDate) return null;
    const hist = await PriceHistory.findOne({
        relatedId: roomTypeId,
        onModel: "RoomType",
        startDate: { $lte: new Date(contractStartDate) }
    })
        .sort({ startDate: -1 })
        .select("price")
        .lean();
    if (hist?.price != null) return toPriceNumber(hist.price);
    return null;
}

async function buildRenewalPreviewPayload(contract) {
    const room = contract.roomId;
    const roomType = room?.roomTypeId;
    const floor = room?.floorId;

    const currentRoomPrice = toPriceNumber(roomType?.currentPrice);
    const priceAtStart = await getRoomTypePriceAtContractStart(
        roomType?._id,
        contract.startDate
    );
    const baselinePrice = priceAtStart != null ? priceAtStart : currentRoomPrice;
    const newRoomPrice =
        currentRoomPrice !== baselinePrice ? currentRoomPrice : null;

    const daysLeft = daysUntilContractEndUtc(contract.endDate);
    let canRenew = contract.status === "active" && daysLeft >= 0;
    let blockingReason = null;

    if (canRenew) {
        try {
            await assertCanOpenRenewalFlow(contract);
        } catch (e) {
            canRenew = false;
            blockingReason = e.message;
        }
    } else if (contract.status !== "active") {
        blockingReason = "Hợp đồng không ở trạng thái cho phép gia hạn.";
    } else if (daysLeft < 0) {
        blockingReason = "Hợp đồng đã hết hạn.";
    }

    return {
        contractId: contract._id,
        contractCode: contract.contractCode,
        startDate: contract.startDate,
        endDate: contract.endDate,
        duration: contract.duration,
        roomName: room?.name || "",
        roomCode: room?.roomCode || "",
        floorName: floor?.name || "",
        roomTypeName: roomType?.typeName || "",
        currentRoomPrice,
        newRoomPrice,
        canRenew,
        // Cho phép từ chối ở 30, 14 và 7 ngày trước khi hết hạn (không chỉ 7 ngày cuối)
        declineRenewalAvailable:
            contract.status === "active" && !contract.renewalDeclined
            && daysLeft >= 0 && (daysLeft === 30 || daysLeft === 14 || daysLeft <= 7),
        renewalWindowDaysRemaining: daysLeft,
        contractStatus: contract.status,
        blockingReason
    };
}

async function notifyManagersAndTenant({ managerTitle, managerContent, tenantId, tenantTitle, tenantContent }) {
    try {
        const managers = await User.find({ role: "manager", status: "active" }).select("_id");
        if (managers.length > 0) {
            const notification = new Notification({
                title: managerTitle,
                content: managerContent,
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
    } catch (err) {
        console.warn("[CONTRACT RENEWAL] ⚠️ Lỗi gửi thông báo cho quản lý:", err.message);
    }

    try {
        const notification = new Notification({
            title: tenantTitle,
            content: tenantContent,
            type: "system",
            status: "sent",
            created_by: null,
            recipients: [
                {
                    recipient_id: tenantId,
                    recipient_role: "tenant",
                    is_read: false
                }
            ]
        });
        await notification.save();
    } catch (err) {
        console.warn("[CONTRACT RENEWAL] ⚠️ Lỗi gửi thông báo cho tenant:", err.message);
    }
}

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
        console.log(`[CONTRACT RENEWAL] Contract: ${c.contractCode}, endDate: ${c.endDate}, renewalDeclined: ${c.renewalDeclined}`);
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const contract of contracts) {
        // Kiểm tra tenantId có tồn tại không
        if (!contract.tenantId) {
            console.warn(`[CONTRACT RENEWAL] ⚠️ Contract ${contract.contractCode} không có tenantId`);
            continue;
        }

        // Gửi thông báo ở mốc 30/14/7 ngày bất kể tenant đã từ chối hay chưa.
        // Tenant vẫn có thể gia hạn / từ chối đến ngày thứ 7 cuối cùng.
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

async function getRenewalPreviewForTenant(contractId, tenantId) {
    const contract = await Contract.findById(contractId)
        .populate({
            path: "roomId",
            populate: [
                { path: "roomTypeId", select: "typeName currentPrice personMax" },
                { path: "floorId", select: "name" }
            ]
        });

    if (!contract) throw new Error("Không tìm thấy hợp đồng.");
    if (String(contract.tenantId) !== String(tenantId)) {
        throw new Error("Bạn không có quyền xem gia hạn cho hợp đồng này.");
    }

    return buildRenewalPreviewPayload(contract);
}

async function confirmContractRenewal(contractId, tenantId, extensionMonths) {
    const months = Number(extensionMonths);
    if (!Number.isFinite(months) || months < MIN_EXTENSION_MONTHS || months > MAX_EXTENSION_MONTHS) {
        throw new Error(`Số tháng gia hạn phải từ ${MIN_EXTENSION_MONTHS} đến ${MAX_EXTENSION_MONTHS}.`);
    }

    const contract = await Contract.findById(contractId)
        .populate({
            path: "roomId",
            populate: [
                { path: "roomTypeId", select: "typeName currentPrice" },
                { path: "floorId", select: "name" }
            ]
        });

    if (!contract) throw new Error("Không tìm thấy hợp đồng.");
    if (String(contract.tenantId) !== String(tenantId)) {
        throw new Error("Bạn không có quyền gia hạn hợp đồng này.");
    }
    if (contract.status !== "active") {
        throw new Error("Chỉ có thể xác nhận gia hạn khi hợp đồng đang hiệu lực.");
    }

    await assertCanOpenRenewalFlow(contract);

    const newEnd = new Date(contract.endDate);
    newEnd.setMonth(newEnd.getMonth() + months);
    contract.endDate = newEnd;
    contract.duration = (contract.duration || 0) + months;
    contract.renewalDeclined = false;
    await contract.save();

    const roomName = contract.roomId?.name || "";
    const summary = `Hợp đồng ${contract.contractCode} đã được gia hạn thêm ${months} tháng. Ngày kết thúc mới: ${formatDate(contract.endDate)}.`;

    await notifyManagersAndTenant({
        managerTitle: `Gia hạn hợp đồng — ${roomName}`,
        managerContent: `Người thuê đã xác nhận gia hạn hợp đồng ${contract.contractCode} (phòng ${roomName}). ${summary}`,
        tenantId,
        tenantTitle: `Xác nhận gia hạn hợp đồng — ${roomName}`,
        tenantContent: summary
    });

    return {
        contract,
        extensionMonths: months,
        newEndDate: contract.endDate
    };
}

async function declineContractRenewal(contractId, tenantId) {
    const contract = await Contract.findById(contractId).populate("roomId", "name");

    if (!contract) throw new Error("Không tìm thấy hợp đồng.");
    if (String(contract.tenantId) !== String(tenantId)) {
        throw new Error("Bạn không có quyền thực hiện thao tác này.");
    }
    if (contract.status !== "active") {
        throw new Error("Chỉ có thể từ chối gia hạn khi hợp đồng đang hiệu lực.");
    }

    const daysLeft = daysUntilContractEndUtc(contract.endDate);
    if (daysLeft < 0) throw new Error("Hợp đồng đã hết hạn.");
    if (daysLeft !== 30 && daysLeft !== 14 && daysLeft > 7) {
        throw new Error("Chỉ có thể từ chối gia hạn khi hợp đồng còn 30, 14 hoặc 7 ngày.");
    }

    contract.renewalDeclined = true;
    await contract.save();

    const roomName = contract.roomId?.name || "";
    const msg = `Bạn đã từ chối gia hạn hợp đồng ${contract.contractCode} (phòng ${roomName}). Bạn vẫn ở đến hết ngày ${formatDate(contract.endDate)}. Khách (Guest) có thể đặt cọc phòng cho kỳ tiếp theo.`;

    await notifyManagersAndTenant({
        managerTitle: `Từ chối gia hạn — ${roomName}`,
        managerContent: `Người thuê đã từ chối gia hạn hợp đồng ${contract.contractCode} (phòng ${roomName}). Ngày kết thúc: ${formatDate(contract.endDate)}. Phòng có thể mở đặt cọc sớm cho khách mới.`,
        tenantId,
        tenantTitle: `Từ chối gia hạn hợp đồng — ${roomName}`,
        tenantContent: msg
    });

    return { contract, message: msg };
}

module.exports = {
    checkAndSendRenewalNotifications,
    sendRenewalNotification,
    getRenewalPreviewForTenant,
    confirmContractRenewal,
    declineContractRenewal,
    RENEWAL_WINDOW_DAYS
};
