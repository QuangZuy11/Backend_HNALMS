const mongoose = require("mongoose");

const { Schema } = mongoose;

/**
 * financial_tickets
 * - amount: number
 * - title: string
 * - referenceId: ObjectId (tham chiếu tới bản ghi nguồn, ví dụ: RepairRequest)
 * - status: string (ví dụ: 'Created', 'Completed', ...)
 * - transactionDate: Date
 */
const FinancialTicketSchema = new Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      ref: "InvoiceIncurred",
      default: null,
    },
    status: {
      type: String,
      default: "Created",
      trim: true,
    },
    // Ngày kế toán xác nhận đã thanh toán (chỉ dùng cho Payment)
    accountantPaidAt: {
      type: Date,
      default: null,
    },
    paymentVoucher: {
      type: String,
      default: null,
      index: true,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
    transactionDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "financial_tickets",
  }
);

const FinancialTicket = mongoose.model(
  "FinancialTicket",
  FinancialTicketSchema,
  "financial_tickets"
);

module.exports = FinancialTicket;
