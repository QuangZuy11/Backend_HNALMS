const mongoose = require("mongoose");

const bookingRequestSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  idCard: {
    type: String,
    required: true,
  },
  dob: {
    type: Date,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  duration: {
    type: Number,
    required: true,
    min: 1,
  },
  prepayMonths: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  gender: { type: String, enum: ["Male", "Female", "Other"] },
  contactRef: { type: String },
  coResidents: [
    {
      fullName: String,
      cccd: String,
    },
  ],
  servicesInfo: [
    {
      serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
      category: String,
      quantity: Number,
    }
  ],
  depositAmount: { type: Number },
  prepayAmount: { type: Number },
  totalAmount: { type: Number },
  transactionCode: { type: String },
  paymentQR: { type: String },
  paymentStatusId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    default: null
  },
  paymentStatus: {
    type: String,
    enum: ["Unpaid", "Paid"],
    default: "Unpaid"
  },
  paymentExpiresAt: { type: Date },
  status: {
    type: String,
    enum: ["Pending", "Processed", "Rejected", "Awaiting Payment", "Expired"],
    default: "Pending",
  },
  rejectionReason: { type: String, default: null }, // "room_taken" | "manual" | null
}, { timestamps: true });

module.exports = mongoose.model("BookingRequest", bookingRequestSchema);
