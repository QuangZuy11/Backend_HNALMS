const cron = require("node-cron");
const BookingRequest = require("../models/booking-request.model");
const Room = require("../../room-floor-management/models/room.model");
const Contract = require("../models/contract.model");
const Deposit = require("../models/deposit.model");

const bookingRequestExpirationJob = () => {
  // Check every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    console.log("[CRON] Checking for expired Booking Requests...");
    try {
      const now = new Date();
      // Find requests where paymentExpiresAt < now and status === "Awaiting Payment"
      const expiredRequests = await BookingRequest.find({
        status: "Awaiting Payment",
        paymentExpiresAt: { $lt: now }
      }).populate("roomId");

      for (const req of expiredRequests) {
        console.log(`[CRON] Expiring request ${req._id} for room ${req.roomId ? req.roomId.name : "N/A"}`);
        req.status = "Expired";
        await req.save();

        // Chỉ set về Available khi KHÔNG có floating deposit
        // Floating deposit = deposit Held chưa bind contract nào (hoặc contract đã terminated/expired)
        // Điều này xảy ra khi: phòng đã có cọc trước đó (vd cọc từ HĐ declined cũ)
        // → guest gửi booking request → manager duyệt → phòng Deposited → guest không trả tiền → hết hạn
        // → phòng phải trở về Deposited (có cọc), không phải Available
        if (req.roomId && req.roomId.status === "Deposited") {
          const allContracts = await Contract.find({
            roomId: req.roomId._id,
          }).select("_id").lean();
          const boundContractIds = new Set(allContracts.map((c) => c._id.toString()));

          const floatingDeposits = await Deposit.find({
            room: req.roomId._id,
            status: "Held",
          }).lean();

          const hasFloatingDeposit = floatingDeposits.some((d) => {
            if (!d.contractId) return true;
            if (!boundContractIds.has(d.contractId.toString())) return true;
            return false;
          });

          if (hasFloatingDeposit) {
            console.log(`[CRON] Room ${req.roomId.name} keeps Deposited (has floating deposit).`);
          } else {
            await Room.findByIdAndUpdate(req.roomId._id, { status: "Available" });
            console.log(`[CRON] Room ${req.roomId.name} is back to Available (Booking Expired, no floating deposit).`);
          }
        }
      }
    } catch (error) {
      console.error("[CRON] Error checking expired Booking Requests:", error);
    }
  });
};

module.exports = bookingRequestExpirationJob;
