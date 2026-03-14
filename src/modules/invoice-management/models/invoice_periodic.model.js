const mongoose = require("mongoose");

const invoicePeriodicSchema = new mongoose.Schema(
  {
    invoiceCode: { type: String, required: true, unique: true },
    
    contractId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Contracts", 
      required: true 
    },
    
    title: { type: String, required: true, trim: true },

    items: [
      {
        itemName: { type: String, required: true }, // VD: "Tiền thuê phòng", "Tiền điện", "Tiền nước", "Wifi"
        oldIndex: { type: Number, default: 0 },     // Chỉ số cũ (dùng cho điện/nước)
        newIndex: { type: Number, default: 0 },     // Chỉ số mới
        usage: { type: Number, default: 1 },        // Lượng sử dụng (Mặc định là 1 cho phòng/dịch vụ cố định)
        unitPrice: { type: Number, required: true },// Đơn giá tại thời điểm tạo hóa đơn
        amount: { type: Number, required: true },   // Thành tiền (usage * unitPrice)
        isIndex: { type: Boolean, default: false }  // Đánh dấu true nếu là dịch vụ có chốt số (Điện, Nước)
      }
    ],

    totalAmount: { type: Number, required: true, default: 0 }, // Tổng tất cả amount trong items cộng lại
    status: { type: String, enum: ["Draft", "Unpaid", "Paid"], default: "Draft" },
    dueDate: { type: Date, required: true },
  },
  { 
    timestamps: true 
  }
);

// Đặt tên collection rõ ràng là 'invoice_periodics' để tránh nhầm lẫn
module.exports = mongoose.model("InvoicePeriodic", invoicePeriodicSchema, "invoice_periodics");