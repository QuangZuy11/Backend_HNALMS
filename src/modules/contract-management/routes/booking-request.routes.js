const express = require("express");
const router = express.Router();
const bookingRequestController = require("../controllers/booking-request.controller");
const { authenticate } = require("../../authentication/middlewares/authenticate");
const { authorize } = require("../../authentication/middlewares/authorize");

// Public route for creating a request
router.post("/", bookingRequestController.createBookingRequest);

// Public polling: FE gọi để kiểm tra trạng thái thanh toán (giống /deposits/status/:transactionCode)
// GET /api/booking-requests/payment-status/:transactionCode
router.get("/payment-status/:transactionCode", bookingRequestController.getPaymentStatus);

// Protected routes
router.get("/", authenticate, authorize("manager", "admin", "owner"), bookingRequestController.getAllBookingRequests);
router.get("/:id", authenticate, authorize("manager", "admin", "owner"), bookingRequestController.getBookingRequestById);
router.patch("/:id/status", authenticate, authorize("manager", "admin", "owner"), bookingRequestController.updateBookingRequestStatus);
router.post("/:id/send-payment", authenticate, authorize("manager", "admin", "owner"), bookingRequestController.sendPaymentInfo);

module.exports = router;

