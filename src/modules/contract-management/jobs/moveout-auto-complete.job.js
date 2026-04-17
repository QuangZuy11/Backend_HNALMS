const cron = require("node-cron");
const MoveOutRequest = require("../models/moveout_request.model");
const Contract = require("../models/contract.model");
const Deposit = require("../models/deposit.model");
const FinancialTicket = require("../../managing-income-expenses/models/financial_tickets");
const Notification = require("../../notification-management/models/notification.model");
const User = require("../../authentication/models/user.model");

const moveOutAutoCompleteJob = () => {
    cron.schedule("0 1 * * *", async () => {
        console.log("[MOVEOUT AUTO-COMPLETE] ⏱️ Bắt đầu job tự động hoàn tất trả phòng...");
        try {
            const result = await autoCompleteMoveOutByEndDate();
            console.log(`[MOVEOUT AUTO-COMPLETE] ✅ Hoàn thành: ${result.completed} yêu cầu đã tự động hoàn tất`);
        } catch (error) {
            console.error("[MOVEOUT AUTO-COMPLETE] ❌ Lỗi:", error.message);
        }
    });

    console.log("[MOVEOUT AUTO-COMPLETE] ✅ Cron job đã được lên lịch: Mỗi ngày lúc 01:00 AM");
};

const _toDateOnly = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

const _getNextMoveOutRefundVoucher = async () => {
    const prefix = "PC";
    const tickets = await FinancialTicket.find({
        paymentVoucher: { $regex: `^${prefix}` }
    }).sort({ paymentVoucher: -1 }).limit(1).select("paymentVoucher");

    let nextNum = 1;
    if (tickets.length > 0) {
        const last = tickets[0].paymentVoucher;
        const match = last.match(/^PC(\d+)$/);
        if (match) nextNum = parseInt(match[1]) + 1;
    }
    return `${prefix}${nextNum.toString().padStart(6, "0")}`;
};

async function autoCompleteMoveOutByEndDate() {
    const today = _toDateOnly(new Date());

    // Tìm tất cả yêu cầu trả phòng đang ở trạng thái Paid
    const pendingRequests = await MoveOutRequest.find({
        status: "Paid"
    }).populate({
        path: "contractId",
        select: "_id contractCode endDate roomId tenantId status",
        populate: [
            { path: "roomId", select: "name" },
            { path: "tenantId", select: "username email phoneNumber" }
        ]
    });

    let completed = 0;
    const errors = [];

    for (const request of pendingRequests) {
        const contract = request.contractId;
        if (!contract) continue;

        const targetDate = _toDateOnly(request.expectedMoveOutDate || contract.endDate);

        // Chỉ auto-complete khi đúng ngày trả phòng (expectedMoveOutDate) hoặc đã quá hạn
        if (today.getTime() < targetDate.getTime()) continue;

        console.log(`[MOVEOUT AUTO-COMPLETE] 📋 Tự động hoàn tất: ${request._id} (HĐ ${contract.contractCode})`);

        try {
            await _completeMoveOut(request, contract, today);
            completed++;
        } catch (err) {
            errors.push({ requestId: request._id, error: err.message });
            console.error(`[MOVEOUT AUTO-COMPLETE] ❌ Lỗi khi hoàn tất ${request._id}: ${err.message}`);
        }
    }

    return { completed, errors };
}

async function _completeMoveOut(request, contract, completedAt) {
    const deposit = await Deposit.findOne({ contractId: contract._id });

    if (deposit?._id) {
        if (request.isDepositForfeited) {
            await Deposit.findByIdAndUpdate(deposit._id, {
                status: "Forfeited",
                refundDate: null,
                forfeitedDate: new Date(),
            });
        } else {
            await Deposit.findByIdAndUpdate(deposit._id, {
                status: "Refunded",
                refundDate: new Date(),
                forfeitedDate: null,
            });
            if (request.depositRefundAmount > 0) {
                const existing = await FinancialTicket.findOne({
                    referenceId: request._id,
                    title: { $regex: /^Hoàn cọc trả phòng/i }
                }).select("_id");

                if (!existing) {
                    const paymentVoucher = await _getNextMoveOutRefundVoucher();
                    await FinancialTicket.create({
                        amount: request.depositRefundAmount,
                        title: `Hoàn cọc trả phòng - HĐ ${contract.contractCode || contract._id}`,
                        referenceId: request._id,
                        status: "Approved",
                        transactionDate: new Date(),
                        accountantPaidAt: null,
                        paymentVoucher,
                    });
                }
            }
        }
    }

    // Terminate hợp đồng
    if (contract.status !== "terminated") {
        contract.status = "terminated";
        await contract.save();
    }

    // Xử lý inactive tenant
    const tenantId = request.tenantId?._id || request.tenantId;
    if (tenantId) {
        const tenant = await User.findById(tenantId).select("_id status");
        if (tenant && tenant.status !== "inactive") {
            const activeCount = await Contract.countDocuments({
                tenantId: tenantId,
                _id: { $ne: contract._id },
                status: { $in: ["active", "extended"] }
            });
            if (activeCount === 0) {
                tenant.status = "inactive";
                await tenant.save();
            }
        }
    }

    // Cập nhật trạng thái yêu cầu trả phòng
    request.status = "Completed";
    request.completedDate = new Date();
    request.managerCompletionNotes = "Tự động hoàn tất do đến ngày trả phòng mà hệ thống chưa xử lý.";
    await request.save();

    // Gửi thông báo cho tenant
    const tenantEmail = request.tenantId?.email || "";
    const tenantName = request.tenantId?.username || "";
    if (tenantEmail) {
        const notification = new Notification({
            title: `Trả phòng đã hoàn tất tự động`,
            content: `Hệ thống đã tự động hoàn tất quy trình trả phòng cho hợp đồng ${contract.contractCode}. Cảm ơn bạn đã sử dụng dịch vụ.`,
            type: "system",
            status: "sent",
            created_by: null,
            recipients: [{
                recipient_id: tenantId,
                recipient_role: "tenant",
                is_read: false
            }]
        });
        await notification.save();
    }

    console.log(`[MOVEOUT AUTO-COMPLETE] ✅ Đã hoàn tất: ${request._id}`);
}

module.exports = { moveOutAutoCompleteJob };