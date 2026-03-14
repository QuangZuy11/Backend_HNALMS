const mongoose = require("mongoose");

const invoiceIncurredSchema = new mongoose.Schema(
  {
    // Mã hóa đơn phát sinh (VD: INV-INC-1234)
    invoiceCode: { type: String, required: true, unique: true },
    
    // Tham chiếu đến Hợp đồng (Xác định người trả tiền)
    contractId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Contracts", 
      required: true 
    },

    // Tham chiếu đến Yêu cầu sửa chữa (Nếu hóa đơn sinh ra từ việc khách làm hỏng đồ)
    repairRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepairRequest",
      default: null,
    },

    // Tham chiếu đến Phiếu thu (Liên kết với module Kế toán Thu-Chi)
    receiptTicketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReceiptTicket", // Đảm bảo tên ref khớp với tên model Phiếu thu của bạn
      default: null,
    },

    // Tiêu đề hóa đơn (VD: "Phí sửa chữa rèm cửa phòng 101")
    title: { type: String, required: true, trim: true },

    // Tổng tiền phát sinh
    totalAmount: { type: Number, required: true, default: 0 },

    // Trạng thái hóa đơn
    status: { 
      type: String, 
      enum: ["Draft", "Unpaid", "Paid"], 
      default: "Draft" 
    },

    // Hạn thanh toán
    dueDate: { type: Date, required: true },
  },
  { 
    timestamps: true // Tự động sinh ra 2 trường: createdAt và updatedAt
  }
);

// Đặt tên collection rõ ràng trong Database là 'invoice_incurreds'
module.exports = mongoose.model("InvoiceIncurred", invoiceIncurredSchema, "invoice_incurreds");