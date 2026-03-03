const cron = require("node-cron");
const Contract = require("../models/contract.model");
const Room = require("../../room-floor-management/models/room.model");

/**
 * Cron Job: Cập nhật trạng thái phòng từ "Deposited" → "Occupied"
 * Chạy mỗi ngày lúc 00:01 để kiểm tra hợp đồng nào bắt đầu hôm nay
 */
const contractStartJob = () => {
    cron.schedule("1 0 * * *", async () => {
        try {
            console.log("[CONTRACT START JOB] ⏱️  Running contract start check...");

            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set to 00:00:00 today

            const endOfDay = new Date(today);
            endOfDay.setHours(23, 59, 59, 999); // Set to 23:59:59 today

            // Tìm các hợp đồng bắt đầu hôm nay (startDate = hôm nay)
            const contracts = await Contract.find({
                startDate: {
                    $gte: today,
                    $lte: endOfDay,
                },
                status: "active",
            }).populate("roomId");

            if (contracts.length === 0) {
                console.log("[CONTRACT START JOB] ✅ No contracts starting today");
                return;
            }

            console.log(`[CONTRACT START JOB] Found ${contracts.length} contract(s) starting today`);

            // Cập nhật trạng thái phòng từ "Deposited" → "Occupied"
            for (const contract of contracts) {
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
                    console.warn(
                        `[CONTRACT START JOB] ⚠️ Room ${room.name} has unexpected status: ${room.status} ` +
                        `(Expected: Deposited). Contract: ${contract.contractCode}`
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
