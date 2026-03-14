const mongoose = require("mongoose");
const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    incurredInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InvoiceIncurred",
      default: null,
    },
    depositId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deposits",
      default: null,
    },
    amount: {
      type: Number,
      required: true,
    },
    transactionCode: {
      type: String,
    },
    status: {
      type: String,
      enum: ["Pending", "Success", "Failed"],
      default: "Pending",
    },
    paymentDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema, "payments");
module.exports = Payment;
