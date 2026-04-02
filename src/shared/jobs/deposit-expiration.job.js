const Deposit = require("../../modules/contract-management/models/deposit.model");
const Contract = require("../../modules/contract-management/models/contract.model");
const Room = require("../../modules/room-floor-management/models/room.model");

// =============================================
// CRON JOB: Xử lý deposit hết hạn
// 1. Pending + hết 5 phút → XÓA deposit (không tạo Payment)
// 2. Held + quá 7 ngày và chưa gán hợp đồng → chuyển Expired, Room → Available
// Chạy mỗi 1 phút
// =============================================

const INTERVAL_MS = 60 * 1000; // 1 phút
const HOLD_PERIOD_DAYS = 7; // Thời gian giữ cọc tối đa

const processExpiredDeposits = async () => {
    try {
        const now = new Date();

        // ========== 1. Xử lý Pending hết hạn 5 phút ==========
        const pendingExpired = await Deposit.find({
            status: "Pending",
            expireAt: { $lt: now },
        });

        for (const deposit of pendingExpired) {
            // XÓA deposit (không tạo Payment)
            await Deposit.findByIdAndDelete(deposit._id);
            console.log(`[CRON] 🗑️ Deposit ${deposit.transactionCode} → Deleted (timeout 5 min)`);
        }

        // ========== 2. Xử lý Held quá 7 ngày (chưa gán hợp đồng) ==========
        const sevenDaysAgo = new Date(now.getTime() - HOLD_PERIOD_DAYS * 24 * 60 * 60 * 1000);
        const heldExpired = await Deposit.find({
            status: "Held",
            createdAt: { $lt: sevenDaysAgo }, // Dùng createdAt (timestamps)
        });

        const heldDepositIds = heldExpired.map((deposit) => deposit._id);
        const linkedDepositIds = await Contract.distinct("depositId", {
            depositId: { $in: heldDepositIds },
        });
        const linkedDepositIdSet = new Set(linkedDepositIds.map((id) => String(id)));

        for (const deposit of heldExpired) {
            // Cọc đã được gán vào hợp đồng thì không được chuyển Expired.
            if (linkedDepositIdSet.has(String(deposit._id))) {
                continue;
            }

            // Cập nhật status → Expired
            deposit.status = "Expired";
            await deposit.save();

            // Cập nhật Room → Available
            await Room.findByIdAndUpdate(deposit.room, { status: "Available" });

            console.log(`[CRON] ⏰ Deposit ${deposit.transactionCode} → Expired (over 7 days)`);
        }
    } catch (error) {
        console.error("[CRON] ❌ Lỗi xử lý deposit:", error.message);
    }
};

// Khởi động cron job
const startDepositExpirationJob = () => {
    console.log("[CRON] 🕐 Deposit expiration job started (interval: 1 minute)");

    // Chạy ngay lần đầu
    processExpiredDeposits();

    // Sau đó chạy mỗi phút
    setInterval(processExpiredDeposits, INTERVAL_MS);
};

module.exports = { startDepositExpirationJob };
