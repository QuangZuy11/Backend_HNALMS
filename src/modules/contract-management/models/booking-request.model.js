const mongoose = require("mongoose");

const bookingRequestSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
  },
  // Khi người dùng trùng cả 3 (cccd + sđt + email), chỉ lưu userInfoId, không lưu lại thông tin cá nhân
  userInfoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserInfo",
    default: null,
  },
  name: { type: String, required: false },
  phone: { type: String, required: false },
  email: { type: String, required: false },
  idCard: { type: String, required: false },
  dob: { type: Date, required: false },
  address: { type: String, required: false },
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
