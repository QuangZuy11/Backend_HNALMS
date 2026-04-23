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
    // Hóa đơn điện/nước/dịch vụ tháng chuyển phòng
    transferInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InvoicePeriodic",
      default: null,
    },
    // Hóa đơn đóng thêm tiền phòng trả trước (khi phòng mới đắt hơn)
    prepaidInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InvoicePeriodic",
      default: null,
    },
    // Phiếu chi hoàn tiền trả trước (khi phòng cũ rẻ hơn / thừa tiền)
    refundTicketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinancialTicket",
      default: null,
    },
    // Thời gian hoàn tất chuyển phòng
    completedAt: {
      type: Date,
      default: null,
    },
    // Ghi chú về xử lý chênh lệch tiền
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
    // Thông tin tính toán chênh lệch tiền thuê trả trước
    proration: {
      oldRoomPrice: { type: Number, default: 0 },        // Giá phòng cũ
      newRoomPrice: { type: Number, default: 0 },        // Giá phòng mới
      availableMonths: { type: Number, default: 0 },     // Số tháng khả dụng từ rentPaidUntil
      availableOldAmount: { type: Number, default: 0 },  // Tiền trả trước khả dụng phòng cũ
      availableNewAmount: { type: Number, default: 0 },  // Tiền trả trước áp dụng cho phòng mới
      difference: { type: Number, default: 0 },          // Chênh lệch (+ phải đóng thêm, - được hoàn)
    },
  },
  {
    timestamps: true,
  }
);

const TransferRequest = mongoose.model("TransferRequest", transferRequestSchema, "transfer_requests");
module.exports = TransferRequest;
