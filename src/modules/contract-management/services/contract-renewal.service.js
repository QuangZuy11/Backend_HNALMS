const Contract = require("../models/contract.model");
const Notification = require("../../notification-management/models/notification.model");
const ContractNotificationLog = require("../models/contract-notification-log.model");
const User = require("../../authentication/models/user.model");
const PriceHistory = require("../../room-floor-management/models/pricehistory.model");
const MoveOutRequest = require("../models/moveout_request.model");

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
    // Không tính ngày cuối: nếu endDate = hôm nay → daysLeft = 0
    return Math.floor((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function isInRenewalWindow(endDate) {
    const daysLeft = daysUntilContractEndUtc(endDate);
    // Cửa sổ gia hạn: từ ngày còn 7 ngày đến ngày còn 30 ngày (không tính ngày cuối)
    return daysLeft >= 7 && daysLeft <= 30;
}

function formatDate(date) {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

function toDateOnly(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

async function checkIfGapContract(contract) {
    if (!contract?.roomId) {
        return { isGapContract: false, primaryContract: null };
    }

    const contractId = contract._id ? contract._id : contract;
    const others = await Contract.find({
        roomId: contract.roomId,
        _id: { $ne: contractId },
        status: { $in: ["active", "inactive"] }
    })
        .select("_id startDate endDate tenantId status depositId isActivated")
        .lean();

    if (!others.length) {
        return { isGapContract: false, primaryContract: null };
    }

    const myStart = toDateOnly(contract.startDate);
    const myEnd = toDateOnly(contract.endDate);

    // Tìm hợp đồng start sớm nhất
    let primaryEarliest = others[0];
    for (const o of others) {
        if (toDateOnly(o.startDate) < toDateOnly(primaryEarliest.startDate)) {
            primaryEarliest = o;
        }
    }
    const type1 = myStart > toDateOnly(primaryEarliest.startDate);

    // Tìm hợp đồng bắt đầu sau endDate của mình với khe >= 7 ngày
    const minGap = 7;
    let nextAfterEnd = null;
    for (const o of others) {
        const oStart = toDateOnly(o.startDate);
        if (oStart.getTime() <= myEnd.getTime()) {
            continue;
        }
        const gapDays = Math.floor((oStart.getTime() - myEnd.getTime()) / (24 * 60 * 60 * 1000));
        if (gapDays < minGap) {
            continue;
        }
        if (
            !nextAfterEnd ||
            oStart.getTime() < toDateOnly(nextAfterEnd.startDate).getTime()
        ) {
            nextAfterEnd = o;
        }
    }
    const type2 = Boolean(nextAfterEnd);
    const isGapContract = type1 || type2;
    const primaryContract = type2 && nextAfterEnd ? nextAfterEnd : type1 ? primaryEarliest : null;

    return { isGapContract, primaryContract };
}

async function getNextActiveContract(roomId, afterDate) {
    const next = await Contract.findOne({
        roomId,
        startDate: { $gt: afterDate },
        status: "active",
        isActivated: true
    })
        .select("_id startDate endDate contractCode tenantId")
        .sort({ startDate: 1 })
        .lean();
    return next;
}

function _monthsBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let months = (end.getFullYear() - start.getFullYear()) * 12;
    months += end.getMonth() - start.getMonth();
    if (end.getDate() >= start.getDate()) {
        months += 1;
    }
    return Math.max(months, 1);
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

    // Kiểm tra gap contract: chỉ được gia hạn tối đa đến ngày bắt đầu hợp đồng kế tiếp
    let maxRenewalEndDate = null;
    let isGapContract = false;
    let nextActiveContract = null;

    const gapCheck = await checkIfGapContract(contract);
    isGapContract = gapCheck.isGapContract;
    if (isGapContract) {
        const next = await getNextActiveContract(contract.roomId, contract.endDate);
        if (next) {
            const nextStart = toDateOnly(next.startDate);
            const myEnd = toDateOnly(contract.endDate);
            if (nextStart.getTime() > myEnd.getTime()) {
                maxRenewalEndDate = next.startDate;
                nextActiveContract = {
                    contractCode: next.contractCode,
                    startDate: next.startDate
                };
            }
        }
    }

    // Số tháng tối đa gia hạn cho gap contract
    let maxExtensionMonths = MAX_EXTENSION_MONTHS;
    if (isGapContract && maxRenewalEndDate) {
        const gapMonths = _monthsBetween(toDateOnly(contract.endDate), toDateOnly(maxRenewalEndDate));
        maxExtensionMonths = Math.min(gapMonths, MAX_EXTENSION_MONTHS);
    }

    const daysLeft = daysUntilContractEndUtc(contract.endDate);
    const inWindow = isInRenewalWindow(contract.endDate);
    const alreadyRenewed = contract.renewalStatus === "renewed";
    const alreadyDeclined = contract.renewalStatus === "declined";

    const canRenew =
        contract.status === "active" &&
        daysLeft >= 0 &&
        !alreadyDeclined &&
        inWindow;

    let blockingReason = null;
    if (alreadyDeclined) {
        blockingReason = "Bạn đã từ chối gia hạn hợp đồng này. Không thể gia hạn thêm.";
    } else if (contract.status !== "active") {
        blockingReason = "Hợp đồng không ở trạng thái cho phép gia hạn.";
    } else if (daysLeft < 0) {
        blockingReason = "Hợp đồng đã hết hạn.";
    } else if (!alreadyRenewed && !inWindow) {
        blockingReason = "Chỉ có thể gia hạn/từ chối khi hợp đồng còn từ 30 ngày đến 7 ngày.";
    } else if (isGapContract && !maxRenewalEndDate) {
        blockingReason = "Hợp đồng ngắn hạn hiện không có hợp đồng kế tiếp để xác định giới hạn gia hạn.";
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
        // Từ chối: chỉ hiện khi CHƯA gia hạn và CHƯA từ chối và trong cửa sổ 7-30 ngày
        declineRenewalAvailable:
            contract.status === "active" &&
            contract.renewalStatus === null &&
            daysLeft >= 0 &&
            inWindow,
        renewalWindowDaysRemaining: daysLeft,
        contractStatus: contract.status,
        blockingReason,
        renewalStatus: contract.renewalStatus || null,
        // Thông tin gap contract
        isGapContract,
        maxRenewalEndDate,
        nextActiveContract,
        maxExtensionMonths,
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
        console.warn("[CONTRACT RENEWAL] Lỗi gửi thông báo cho quản lý:", err.message);
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
        console.warn("[CONTRACT RENEWAL] Lỗi gửi thông báo cho tenant:", err.message);
    }
}

async function checkAndSendRenewalNotifications() {
    console.log("[CONTRACT RENEWAL] Bắt đầu kiểm tra gia hạn hợp đồng...");

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const maxDays = 60;
    const maxDate = new Date(today.getTime() + maxDays * 24 * 60 * 60 * 1000);

    console.log(`[CONTRACT RENEWAL] Today: ${today.toISOString()}`);
    console.log(`[CONTRACT RENEWAL] Max Date (${maxDays} days): ${maxDate.toISOString()}`);

    const contracts = await Contract.find({
        status: "active",
        renewalStatus: { $in: [null, "renewed"] },
        endDate: { $gte: today, $lte: maxDate }
    }).populate("tenantId").populate("roomId", "name");

    console.log(`[CONTRACT RENEWAL] Tìm thấy ${contracts.length} hợp đồng sắp hết hạn`);

    let sentCount = 0;
    let skippedCount = 0;

    for (const contract of contracts) {
        if (!contract.tenantId) {
            console.warn(`[CONTRACT RENEWAL] Contract ${contract.contractCode} không có tenantId`);
            continue;
        }

        for (const config of REMINDER_CONFIGS) {
            const targetDate = new Date(contract.endDate);
            targetDate.setUTCDate(targetDate.getUTCDate() - config.days);
            targetDate.setUTCHours(0, 0, 0, 0);

            if (today.getTime() >= targetDate.getTime()) {
                const result = await sendRenewalNotification(contract, config);
                if (result) sentCount++;
                else skippedCount++;
            }
        }
    }

    console.log(`[CONTRACT RENEWAL] Hoàn thành: Đã gửi ${sentCount} notification, bỏ qua ${skippedCount} notification đã gửi trước đó`);
}

async function sendRenewalNotification(contract, config) {
    try {
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

        if (logResult.matchedCount > 0) {
            console.log(`[CONTRACT RENEWAL] Notification ${config.type} đã gửi cho contract ${contract.contractCode}`);
            return false;
        }

        const roomName = contract.roomId?.name || "Unknown";
        const title = `Thông báo gia hạn hợp đồng - ${roomName}`;
        const content = `Hợp đồng thuê phòng ${contract.contractCode} sẽ hết hạn sau ${config.days} ngày (${formatDate(contract.endDate)}). Vui lòng liên hệ Quản Lý để gia hạn hoặc truy cập vào mục Gia Hạn Hợp Đồng trên ứng dụng. Xin Cảm Ơn !`;

        const notification = new Notification({
            title,
            content,
            type: "system",
            status: "sent",
            created_by: null,
            recipients: [{
                recipient_id: contract.tenantId._id,
                recipient_role: "tenant",
                is_read: false
            }]
        });

        await notification.save();

        await ContractNotificationLog.updateOne(
            { contractId: contract._id, reminderType: config.type },
            { $set: { notificationId: notification._id } }
        );

        console.log(`[CONTRACT RENEWAL] Đã gửi notification ${config.type} cho contract ${contract.contractCode} - Tenant: ${contract.tenantId.fullName || contract.tenantId.email}`);
        return true;

    } catch (error) {
        console.error(`[CONTRACT RENEWAL] Lỗi gửi notification cho contract ${contract.contractCode}:`, error.message);
        return false;
    }
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
    if (contract.renewalStatus === "declined") {
        throw new Error("Bạn đã từ chối gia hạn hợp đồng này, không thể gia hạn.");
    }

    const daysLeft = daysUntilContractEndUtc(contract.endDate);
    if (daysLeft < 0) throw new Error("Hợp đồng đã hết hạn.");

    // Gia hạn: phải nằm trong cửa sổ 7-30 ngày
    if (!isInRenewalWindow(contract.endDate)) {
        throw new Error("Chỉ có thể gia hạn khi hợp đồng còn từ 30 ngày đến 7 ngày.");
    }

    // Kiểm tra gap contract: chỉ được gia hạn tối đa đến ngày bắt đầu hợp đồng kế tiếp
    let maxRenewalEndDate = null;
    let next = null;
    
    const gapCheck = await checkIfGapContract(contract);
    if (gapCheck.isGapContract) {
        next = await getNextActiveContract(contract.roomId, contract.endDate);
        if (next) {
            const nextStart = toDateOnly(next.startDate);
            const myEnd = toDateOnly(contract.endDate);
            if (nextStart.getTime() > myEnd.getTime()) {
                maxRenewalEndDate = next.startDate;
            }
        }
    }

    // Tính maxExtensionMonths cho gap contract
    let maxExt = MAX_EXTENSION_MONTHS;
    if (maxRenewalEndDate) {
        maxExt = _monthsBetween(toDateOnly(contract.endDate), toDateOnly(maxRenewalEndDate));
        maxExt = Math.min(maxExt, MAX_EXTENSION_MONTHS);
    }
    if (months > maxExt) {
        const gapMsg = maxRenewalEndDate
            ? `Hợp đồng ngắn hạn chỉ được phép gia hạn tối đa ${maxExt} tháng (đến ngày ${formatDate(maxRenewalEndDate)} — ngày khách mới bắt đầu hợp đồng ${next?.contractCode || "kế tiếp"}).`
            : `Hợp đồng ngắn hạn có hợp đồng kế tiếp nhưng không xác định được giới hạn ngày gia hạn.`;
        throw new Error(gapMsg);
    }

    // Gia hạn: update endDate và duration
    const newEnd = new Date(contract.endDate);
    newEnd.setMonth(newEnd.getMonth() + months);
    contract.endDate = newEnd;
    contract.duration = (contract.duration || 0) + months;
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
    if (contract.renewalStatus === "declined") {
        throw new Error("Bạn đã từ chối gia hạn rồi. Không thể thay đổi quyết định.");
    }
    if (contract.renewalStatus === "renewed") {
        throw new Error("Bạn đã gia hạn hợp đồng này rồi, không thể từ chối.");
    }

    const daysLeft = daysUntilContractEndUtc(contract.endDate);
    if (daysLeft < 0) throw new Error("Hợp đồng đã hết hạn.");
    if (!isInRenewalWindow(contract.endDate)) {
        throw new Error("Chỉ có thể từ chối gia hạn khi hợp đồng còn từ 30 ngày đến 7 ngày.");
    }

    contract.renewalStatus = "declined";
    await contract.save();

    //  Tự động sinh Move-out Request
    const { isGapContract } = await checkIfGapContract(contract);

    const existingReq = await MoveOutRequest.findOne({ contractId: contract._id });
    if (!existingReq) {
        const moveOutReq = new MoveOutRequest({
            contractId: contract._id,
            tenantId: contract.tenantId,
            expectedMoveOutDate: contract.endDate,
            reason: "Từ chối gia hạn - Kết thúc tự nhiên",
            requestDate: startOfUtcDay(new Date()),
            isEarlyNotice: false,
            isUnderMinStay: false,
            isDepositForfeited: false,
            isGapContract: isGapContract,
            status: "Requested"
        });
        await moveOutReq.save();
    }

    const roomName = contract.roomId?.name || "";
    const msg = `Bạn đã từ chối gia hạn hợp đồng ${contract.contractCode} (phòng ${roomName}). Bạn vẫn ở đến hết ngày ${formatDate(contract.endDate)}. Vui lòng trả phòng khi hết hạn.`;

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
