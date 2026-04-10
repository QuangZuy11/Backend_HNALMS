const express = require("express");
const router = express.Router();
const bookingRequestController = require("../controllers/booking-request.controller");
const { authenticate } = require("../../authentication/middlewares/authenticate");
const { authorize } = require("../../authentication/middlewares/authorize");

// Public route for creating a request
router.post("/", bookingRequestController.createBookingRequest);

// Protected routes
router.get("/", authenticate, authorize("manager", "admin", "owner"), bookingRequestController.getAllBookingRequests);
router.get("/:id", authenticate, authorize("manager", "admin", "owner"), bookingRequestController.getBookingRequestById);
router.patch("/:id/status", authenticate, authorize("manager", "admin", "owner"), bookingRequestController.updateBookingRequestStatus);
router.post("/:id/send-payment", authenticate, authorize("manager", "admin", "owner"), bookingRequestController.sendPaymentInfo);

module.exports = router;
