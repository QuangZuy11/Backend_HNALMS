const Deposit = require("../../modules/contract-management/models/deposit.model");
const Contract = require("../../modules/contract-management/models/contract.model");
const Room = require("../../modules/room-floor-management/models/room.model");

// =============================================
// CRON JOB: Xử lý deposit hết hạn
// 1. Pending + hết 5 phút → XÓA deposit (không tạo Payment)
// 2. Held + quá 30 ngày:
//    - Không có contract liên kết → Expired, Room → Available
//    - Có contract liên kết nhưng chưa activate (status="inactive"|"active" && isActivated=false) → Reset timer (không expire)
//    - activationStatus = false (contract bị xóa/chưa ký) → Expired
// Chạy mỗi 1 phút
// =============================================

const INTERVAL_MS = 60 * 1000; // 1 phút
const HOLD_PERIOD_DAYS = 30; // Thời gian giữ cọc tối đa (chỉ áp dụng khi không có contract chờ activate)

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

        // ========== 2. Xử lý Held quá 30 ngày ==========
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
            // Lấy thông tin contract liên kết (dùng contractId mới)
            let linkedContract = null;
            if (deposit.contractId) {
                const Contract = require("../../modules/contract-management/models/contract.model");
                linkedContract = await Contract.findById(deposit.contractId);
            }

            if (linkedContract) {
                // Có contract liên kết: kiểm tra trạng thái activation
                // status="inactive" (>30 ngày) hoặc "active" (1-30 ngày) đều chưa activate → reset timer
                if (linkedContract.isActivated === false &&
                    (linkedContract.status === "active" || linkedContract.status === "inactive")) {
                    // Contract đang chờ ngày activate → Reset timer, không expire
                    deposit.expireAt = new Date(now.getTime() + HOLD_PERIOD_DAYS * 24 * 60 * 60 * 1000);
                    await deposit.save();
                    console.log(`[CRON] 🔄 Deposit ${deposit.transactionCode} → Timer reset (contract pending activation)`);
                    continue;
                }
                // Contract đã active (isActivated=true) hoặc đã terminated/expired → xử lý expire
            }

            // Không có contract HOẶC contract đã terminated/expired → Expired
            deposit.status = "Expired";
            await deposit.save();

            // Cập nhật Room → Available (chỉ khi không có contract active nào đang giữ phòng)
            await Room.findByIdAndUpdate(deposit.room, { status: "Available" });

            console.log(`[CRON] ⏰ Deposit ${deposit.transactionCode} → Expired (over 30 days, no active contract)`);
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
