const cron = require("node-cron");
const Contract = require("../models/contract.model");
const Room = require("../../room-floor-management/models/room.model");
const User = require("../../authentication/models/user.model");

/**
 * Cron Job: Kích hoạt tài khoản tenant và cập nhật trạng thái phòng
 * - Tenant account: "inactive" → "active" khi đến ngày bắt đầu hợp đồng
 * - Room status: "Deposited" → "Occupied" khi đến ngày bắt đầu hợp đồng
 * Chạy mỗi ngày lúc 00:01
 */
const contractStartJob = () => {
    cron.schedule("1 0 * * *", async () => {
        try {
            console.log("[CONTRACT START JOB] ⏱️  Running contract start check...");

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const endOfDay = new Date(today);
            endOfDay.setHours(23, 59, 59, 999);

            // Tìm các hợp đồng bắt đầu hôm nay
            const contracts = await Contract.find({
                startDate: { $gte: today, $lte: endOfDay },
                status: "active",
            }).populate("roomId");

            if (contracts.length === 0) {
                console.log("[CONTRACT START JOB] ✅ No contracts starting today");
                return;
            }

            console.log(`[CONTRACT START JOB] Found ${contracts.length} contract(s) starting today`);

            for (const contract of contracts) {
                // 1. Kích hoạt tài khoản tenant (inactive → active)
                if (contract.tenantId) {
                    const tenant = await User.findById(contract.tenantId);
                    if (tenant && tenant.status === "inactive") {
                        tenant.status = "active";
                        await tenant.save();
                        console.log(
                            `[CONTRACT START JOB] ✅ Tenant account activated: ${tenant.username} ` +
                            `(Contract: ${contract.contractCode})`
                        );
                    }
                }

                // 2. Cập nhật trạng thái phòng Deposited → Occupied
                const room = contract.roomId;
                if (!room) {
                    console.warn(`[CONTRACT START JOB] ⚠️ Room not found for contract ${contract._id}`);
                    continue;
                }

                if (room.status === "Deposited") {
                    room.status = "Occupied";
                    await room.save();
                    console.log(
                        `[CONTRACT START JOB] ✅ Room ${room.name} updated: Deposited → Occupied ` +
                        `(Contract: ${contract.contractCode})`
                    );
                } else {
                    console.log(
                        `[CONTRACT START JOB] ℹ️ Room ${room.name} status: ${room.status} ` +
                        `(no change needed). Contract: ${contract.contractCode}`
                    );
                }
            }

            console.log("[CONTRACT START JOB] ✅ Contract start check completed");
        } catch (error) {
            console.error("[CONTRACT START JOB] ❌ Error:", error.message);
        }
    });

    console.log("[CONTRACT START JOB] ✅ Cron job scheduled: Check contract start dates daily at 00:01");
};

module.exports = contractStartJob;
