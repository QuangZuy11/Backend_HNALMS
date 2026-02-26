const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    invoiceCode: { type: String, required: true, unique: true, trim: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    // Tham chiếu đến yêu cầu sửa chữa tương ứng (nếu là hóa đơn phát sinh sửa chữa)
    repairRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepairRequest",
    },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["Periodic", "Incurred"], default: "Periodic" },
    totalAmount: { type: Number, required: true, default: 0 },
    // [CẬP NHẬT] Đổi lại Enum Status theo ý bạn
    status: { type: String, enum: ["Draft", "Unpaid", "Paid"], default: "Draft" },
    dueDate: { type: Date, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);