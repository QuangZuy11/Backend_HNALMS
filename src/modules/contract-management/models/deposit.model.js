const mongoose = require("mongoose");
const { Schema } = mongoose;

const depositSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    transactionCode: {
      type: String,
      unique: true,
      sparse: true, // cho phép null nhưng unique khi có giá trị
    },
    // codeDeposit: DEPRECATED - Không còn sử dụng từ 03/03/2026
    codeDeposit: {
      type: String,
      unique: true,
      sparse: true, // Format cũ: CHN-P310-020226 (giữ lại để backward compatible)
    },
    status: {
      type: String,
      enum: ["Pending", "Held", "Refunded", "Forfeited", "Expired"],
      default: "Pending",
    },
    // Trạng thái kích hoạt (áp dụng khi deposit đã thanh toán = Held)
    // null = chưa active (chờ ngày active của hợp đồng)
    // true = đã active (hợp đồng đã active hoặc ngày active đã đến)
    // false = deposit bị reset (khi có deposit mới cho cùng phòng, deposit cũ bị reset)
    activationStatus: {
      type: Boolean,
      default: null,
    },
    expireAt: {
      type: Date,
      default: null,
    },
    refundDate: {
      type: Date,
      default: null,
    },
    forfeitedDate: {
      type: Date,
      default: null,
    },
    // Liên kết trực tiếp với contract (null khi chưa có contract, set khi contract được tạo)
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contracts",
      default: null,
      sparse: true, // cho phép nhiều null vì nhiều deposit chưa có contract
    },
  },
  {
    timestamps: true,
  }
);

const Deposit = mongoose.model("Deposits", depositSchema, "deposits");
module.exports = Deposit;
