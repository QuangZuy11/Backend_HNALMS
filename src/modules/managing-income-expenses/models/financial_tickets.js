const mongoose = require("mongoose");

const { Schema } = mongoose;

/**
 * financial_tickets
 * - type: 'Receipt' | 'Payment'
 * - amount: number
 * - title: string
 * - referenceId: ObjectId (tham chiếu tới bản ghi nguồn, ví dụ: RepairRequest)
 * - status: string (ví dụ: 'Created', 'Completed', ...)
 * - transactionDate: Date
 */
const FinancialTicketSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Receipt", "Payment"],
      required: true,
    },
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
      // Có thể tham chiếu tới nhiều loại entity khác nhau, hiện tại dùng cho RepairRequest
      ref: "RepairRequest",
      default: null,
    },
    status: {
      type: String,
      default: "Created",
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
