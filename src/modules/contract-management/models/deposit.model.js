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
    codeDeposit: {
      type: String,
      unique: true,
      sparse: true, // Format: CHN-P310-020226
    },
    status: {
      type: String,
      enum: ["Pending", "Held", "Refunded", "Forfeited", "Expired"],
      default: "Pending",
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
  },
  {
    timestamps: true,
  }
);

const Deposit = mongoose.model("Deposits", depositSchema, "deposits");
module.exports = Deposit;
