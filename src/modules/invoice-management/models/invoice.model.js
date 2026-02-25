const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    invoiceCode: { type: String, required: true, unique: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ["Periodic", "Incurred"], default: "Periodic" },
    
    // ĐÂY CHÍNH LÀ PHẦN "INVOICE DETAIL" NẰM GỌN BÊN TRONG HÓA ĐƠN
    items: [
      {
        itemName: { type: String, required: true }, // VD: "Tiền thuê phòng", "Tiền điện", "Tiền nước", "Wifi"
        oldIndex: { type: Number, default: 0 },     // Chỉ số cũ (dùng cho điện/nước)
        newIndex: { type: Number, default: 0 },     // Chỉ số mới
        usage: { type: Number, default: 1 },        // Lượng sử dụng (Mặc định là 1 cho phòng/dịch vụ cố định)
        unitPrice: { type: Number, required: true },// Đơn giá tại thời điểm tạo hóa đơn
        amount: { type: Number, required: true },   // Thành tiền (usage * unitPrice)
      }
    ],

    totalAmount: { type: Number, required: true, default: 0 }, // Tổng tất cả amount trong items cộng lại
    status: { type: String, enum: ["Draft", "Unpaid", "Paid"], default: "Draft" },
    dueDate: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);