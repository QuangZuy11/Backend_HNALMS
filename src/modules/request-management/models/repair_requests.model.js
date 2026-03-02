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
    enum: ["Pending", "Processing", "Done"],
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
  // Trạng thái thanh toán: tách riêng với trạng thái xử lý (status)
  // - NONE   : chưa phát sinh nghĩa vụ thanh toán (mới tạo, đang xử lý, hoặc sửa miễn phí không cần thu)
  // - UNPAID : đã phát sinh hóa đơn nhưng cư dân chưa thanh toán (chờ thanh toán)
  // - PAID   : hóa đơn/phiếu chi đã hoàn tất
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
