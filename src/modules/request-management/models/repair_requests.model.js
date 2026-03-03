const mongoose = require("mongoose");
const { Schema } = mongoose;

const RepairRequestSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  devicesId: {
    type: Schema.Types.ObjectId,
    ref: "Device",
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ["Sửa chữa", "Bảo trì"],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  images: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ["Pending", "Processing", "Done", "Unpair"],
    required: true,
    default: "Pending"
  },
  notes: {
    type: String,
    default: ""
  },
  // Loại thanh toán: REVENUE (sửa chữa có phí) hoặc EXPENSE (sửa chữa miễn phí)
  // Từ paymentType có thể suy ra người thanh toán:
  // - REVENUE  -> Khách hàng
  // - EXPENSE  -> Chủ nhà
  paymentType: {
    type: String,
    enum: ["REVENUE", "EXPENSE"],
    default: null,
  },
  // (Deprecated) Trạng thái thanh toán: không còn dùng cho luồng yêu cầu sửa chữa.
  // Luồng "sửa chữa có phí" dùng status = Unpair thay cho paymentStatus.
  paymentStatus: {
    type: String,
    enum: ["NONE", "UNPAID", "PAID"],
    default: "NONE",
  },
  createdDate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: false });

const RepairRequest = mongoose.model(
  "RepairRequest",
  RepairRequestSchema,
  "repair_requests"
);

module.exports = RepairRequest;
