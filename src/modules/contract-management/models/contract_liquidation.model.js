const mongoose = require("mongoose");
const { Schema } = mongoose;

const contractLiquidationSchema = new Schema(
  {
    // FK → contracts (bắt buộc)
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contracts",
      required: true,
    },

    // ENUM: 'force_majeure' | 'violation'
    liquidationType: {
      type: String,
      enum: ["force_majeure", "violation"],
      required: true,
    },

    // Ngày chính thức thanh lý
    liquidationDate: {
      type: Date,
      required: true,
    },

    // Ghi chú lý do thanh lý
    note: {
      type: String,
      required: true,
      trim: true,
    },

    // Mảng URL ảnh bằng chứng (Cloudinary)
    images: {
      type: [String],
      validate: {
        validator: function (arr) {
          return arr && arr.length >= 1;
        },
        message: "Phải có ít nhất 1 ảnh bằng chứng.",
      },
    },

    // Chỉ có giá trị khi liquidationType = 'force_majeure', còn lại = null
    depositRefundAmount: {
      type: Number,
      default: null,
    },
    remainingRentAmount: {
      type: Number,
      default: null,
    },

    // Chỉ có giá trị khi liquidationType = 'violation', còn lại = null
    rentDebtAmount: {
      type: Number,
      default: null,
    },

    // Tổng hóa đơn tất toán
    totalSettlement: {
      type: Number,
      required: true,
    },

    // FK → invoice_periodics (hóa đơn tất toán — dùng khi cần thu tiền, A < 0 hoặc vi phạm)
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InvoicePeriodic",
      default: null,
    },

    // FK → financial_tickets (phiếu chi hoàn tiền — dùng khi A >= 0, force_majeure)
    financialTicketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinancialTicket",
      default: null,
    },

    // Loại kết quả tài chính:
    //   'refund'  → tenant nhận hoàn tiền (phiếu chi, màu xanh)
    //   'collect' → tenant phải trả thêm (hóa đơn, màu đỏ)
    settlementType: {
      type: String,
      enum: ["refund", "collect"],
      default: null,
    },

    // Mảng FK → meterreadings (chỉ số điện/nước cuối)
    meterReadingIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "MeterReading",
      default: [],
    },

    status: {
      type: String,
      enum: ["pending_owner", "pending_accountant", "completed"],
      default: "pending_owner",
    },
  },
  {
    timestamps: true,
  }
);

const ContractLiquidation = mongoose.model(
  "ContractLiquidation",
  contractLiquidationSchema,
  "contract_liquidations"
);

module.exports = ContractLiquidation;
