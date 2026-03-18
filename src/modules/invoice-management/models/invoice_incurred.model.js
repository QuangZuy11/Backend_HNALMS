const mongoose = require("mongoose");

const invoiceIncurredSchema = new mongoose.Schema(
  {
    invoiceCode: { type: String, required: true, unique: true },
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contracts",
      required: true,
    },
    repairRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepairRequest",
      default: null,
    },
    title: { type: String, required: true, trim: true },
    totalAmount: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ["Paid", "Unpaid", "Draft"], default: "Draft" },
    type: { type: String, enum: ["violation", "repair"], default: "violation" },
    dueDate: { type: Date, required: true },
    images: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InvoiceIncurred", invoiceIncurredSchema, "invoices_incurred");
