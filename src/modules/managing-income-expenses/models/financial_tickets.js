const mongoose = require("mongoose");

const { Schema } = mongoose;

const FinancialTicketSchema = new Schema(
  {
    // Phân loại phiếu để tách biệt Chi phí và Rút vốn
    ticketType: {
      type: String,
      enum: ['Expense', 'OwnerRemittance'], 
      default: 'Expense',
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
      ref: "InvoiceIncurred",
      default: null,
    },
    
    // Trạng thái chung cho các loại phiếu
    status: {
      type: String,
      enum: ['Created', 'Pending', 'Completed', 'Rejected'], 
      default: "Created",
      trim: true,
    },
    
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