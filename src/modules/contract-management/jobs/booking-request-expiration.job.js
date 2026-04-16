const cron = require("node-cron");
const BookingRequest = require("../models/booking-request.model");
const Room = require("../../room-floor-management/models/room.model");

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

        if (req.roomId && req.roomId.status === "Deposited") { 
             await Room.findByIdAndUpdate(req.roomId._id, { status: "Available" });
             console.log(`[CRON] Room ${req.roomId.name} is back to Available (Booking Expired).`);
        }
      }
    } catch (error) {
      console.error("[CRON] Error checking expired Booking Requests:", error);
    }
  });
};

module.exports = bookingRequestExpirationJob;
