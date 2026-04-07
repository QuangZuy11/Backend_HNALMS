const Deposit = require("../../modules/contract-management/models/deposit.model");
const Contract = require("../../modules/contract-management/models/contract.model");
const Room = require("../../modules/room-floor-management/models/room.model");

// =============================================
// CRON JOB: Xử lý deposit hết hạn
// 1. Pending + hết 5 phút → XÓA deposit (không tạo Payment)
// 2. Held + quá 30 ngày:
//    - Có contractId liên kết → Giữ nguyên Held, bỏ qua (chỉ hoàn cọc thủ công)
//    - Không có contractId → Expired, Room → Available
// Chạy mỗi 1 phút
// =============================================

const INTERVAL_MS = 60 * 1000; // 1 phút
const HOLD_PERIOD_DAYS = 30;

const processExpiredDeposits = async () => {
    try {
        const now = new Date();

        // ========== 1. Xử lý Pending hết hạn 5 phút ==========
        const pendingExpired = await Deposit.find({
            status: "Pending",
            expireAt: { $lt: now },
        });

        for (const deposit of pendingExpired) {
            await Deposit.findByIdAndDelete(deposit._id);
            console.log(`[CRON] 🗑️ Deposit ${deposit.transactionCode} → Deleted (timeout 5 min)`);
        }

        // ========== 2. Xử lý Held quá 30 ngày ==========
        const thirtyDaysAgo = new Date(now.getTime() - HOLD_PERIOD_DAYS * 24 * 60 * 60 * 1000);
        const heldExpired = await Deposit.find({
            status: "Held",
            contractId: { $exists: false, $eq: null }, // Chỉ lấy deposit KHÔNG có contractId
            createdAt: { $lt: thirtyDaysAgo },
        });

        for (const deposit of heldExpired) {
            // Nếu deposit vẫn có contractId (double-check) → skip
            if (deposit.contractId) {
                console.log(`[CRON] 🔒 Deposit ${deposit.transactionCode} → Held (có contract liên kết, bỏ qua)`);
                continue;
            }

            // Không có contract liên kết → Expired
            deposit.status = "Expired";
            await deposit.save();

            await Room.findByIdAndUpdate(deposit.room, { status: "Available" });

            console.log(`[CRON] ⏰ Deposit ${deposit.transactionCode} → Expired (over 30 days, no contract)`);
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
