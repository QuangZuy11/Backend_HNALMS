const mongoose = require("mongoose");
const { Schema } = mongoose;

const contractSchema = new Schema(
  {
    contractCode: {
      type: String,
      required: true,
      unique: true, // Format: HN/SoPhong/Nam/HDSV/Random3
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    depositId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deposits",
      default: null,
    },
    // List of co-residents (if any)
    coResidents: [
      {
        fullName: String,
        dob: Date,
        cccd: String,
        phone: String,
        _id: false,
      },
    ],
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    rentPaidUntil: {
      type: Date,
      default: null,
    },
    // Duration in months
    duration: {
      type: Number,
      required: true,
      min: 1, // Allow short-term contracts (min 1 month for rooms with future contracts)
    },
    status: {
      type: String,
      enum: ["active", "inactive", "expired", "terminated"],
      default: "active",
    },
    // Hợp đồng đã được kích hoạt chưa (khi startDate <= today)
    // false = chưa kích hoạt (ngày bắt đầu trong tương lai)
    // true = đã kích hoạt (ngày bắt đầu đã đến hoặc trong quá khứ)
    isActivated: {
      type: Boolean,
      default: false,
    },
    /**
     * Trạng thái hành động gia hạn/từ chối của tenant trong cửa sổ gia hạn:
     * - null: chưa thực hiện hành động nào, có thể gia hạn hoặc từ chối (1 lần duy nhất)
     * - "renewed": đã gia hạn rồi, không thể gia hạn/từ chối nữa
     * - "declined": đã từ chối rồi, không thể gia hạn/từ chối nữa
     * Cửa sổ gia hạn: từ ngày còn 30 ngày đến ngày còn 7 ngày (tính cả ngày đầu và ngày cuối)
     */
    renewalStatus: {
      type: String,
      enum: ["renewed", "declined"],
      default: null,
    },
    // Terms & Conditions (Optional snapshot or ref)
    terms: {
      content: String, // Or link to a static terms file
    },
    images: [String], // Photos of contract or room state
  },
  {
    timestamps: true,
  },
);

const Contract = mongoose.model("Contracts", contractSchema, "contracts");
module.exports = Contract;
