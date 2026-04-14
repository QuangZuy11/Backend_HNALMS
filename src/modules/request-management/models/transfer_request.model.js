const mongoose = require("mongoose");

const transferRequestSchema = new mongoose.Schema(
  {
    // Mã yêu cầu chuyển phòng (auto-generated)
    requestCode: {
      type: String,
      required: true,
      unique: true,
    },
    // Tenant gửi yêu cầu
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Hợp đồng hiện tại
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contracts",
      required: true,
    },
    // Phòng hiện tại (phòng cũ)
    currentRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    // Phòng muốn chuyển đến (phòng mới)
    targetRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    // Ngày chuyển phòng
    transferDate: {
      type: Date,
      required: true,
    },
    // Lý do chuyển phòng
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    // Trạng thái yêu cầu
    status: {
      type: String,
      enum: ["Pending", "Approved", "InvoiceReleased", "Paid", "Rejected", "Completed", "Cancelled"],
      default: "Pending",
    },
    // Lý do từ chối (nếu có)
    rejectReason: {
      type: String,
      default: "",
    },
    // Ghi chú của manager khi duyệt
    managerNote: {
      type: String,
      default: "",
    },
    // [MỚI] Hóa đơn chuyển phòng (nếu có)
    transferInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InvoicePeriodic",
      default: null,
    },
    // [MỚI] Thời gian hoàn tất chuyển phòng
    completedAt: {
      type: Date,
      default: null,
    },
    // [MỚI] Ghi chú về xử lý chênh lệch tiền
    prorationNote: {
      type: String,
      default: "",
    },
    // [MỚI] ID của hợp đồng mới được tạo sau khi hoàn tất chuyển phòng
    newContractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contracts",
      default: null,
    },
    // Thông tin tính toán chênh lệch tiền thuê
    proration: {
      oldRoomPrice: { type: Number, default: 0 },       // Giá phòng cũ
      newRoomPrice: { type: Number, default: 0 },        // Giá phòng mới
      daysRemainingInMonth: { type: Number, default: 0 }, // Số ngày còn lại trong tháng
      oldRoomRefund: { type: Number, default: 0 },       // Tiền thừa phòng cũ
      newRoomCharge: { type: Number, default: 0 },       // Tiền phải đóng phòng mới
      difference: { type: Number, default: 0 },          // Chênh lệch (+ phải đóng thêm, - được hoàn)
    },
  },
  {
    timestamps: true,
  }
);

const TransferRequest = mongoose.model("TransferRequest", transferRequestSchema, "transfer_requests");
module.exports = TransferRequest;
