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

    // FK → invoice_periodics (hóa đơn tất toán)
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InvoicePeriodic",
      default: null,
    },

    // Mảng FK → meterreadings (chỉ số điện/nước cuối)
    meterReadingIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "MeterReading",
      default: [],
    },

    // Trạng thái thanh lý: pending_owner → pending_accountant → completed
    // Chỉ có ở trạng thái completed thì contract/room/deposit mới bị thay đổi
    status: {
      type: String,
      enum: ["pending_owner", "pending_accountant", "completed"],
      default: "pending_owner",
    },

    // Thời điểm chủ nhà duyệt thanh lý
    ownerApprovedAt: {
      type: Date,
      default: null,
    },
    ownerApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      default: null,
    },

    // Thời điểm kế toán giải ngân / xác nhận thanh toán
    accountantPaidAt: {
      type: Date,
      default: null,
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
