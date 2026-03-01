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
    status: {
      type: String,
      enum: ["Held", "Refunded", "Forfeited"],
      default: "Held",
    },
    refundDate: {
      type: Date,
      default: null,
    },
    createdDate: {
      type: Date,
      default: Date.now,
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
