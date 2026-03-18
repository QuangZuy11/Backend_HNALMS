const mongoose = require("mongoose");
const { Schema } = mongoose;

const RepairRequestSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  roomId: {
    type: Schema.Types.ObjectId,
    ref: "Room",
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
  // Trạng thái xử lý & thanh toán gộp chung:
  // - Pending    : chờ xử lý (mới tạo)
  // - Processing : đang xử lý
  // - Done       : đã xử lý (sửa chữa miễn phí – chủ nhà chịu chi phí)
  // - Unpaid     : đã xử lý, chờ thanh toán (sửa chữa có phí – cư dân chưa thanh toán)
  // - Paid       : đã thanh toán
  status: {
    type: String,
    enum: ["Pending", "Processing", "Done", "Unpaid", "Paid"],
    required: true,
    default: "Pending"
  },
  notes: {
    type: String,
    default: ""
  },
  // Loại thanh toán: REVENUE (sửa chữa có phí – cư dân trả) hoặc EXPENSE (sửa chữa miễn phí – chủ nhà trả)
  paymentType: {
    type: String,
    enum: ["REVENUE", "EXPENSE"],
    default: null,
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
