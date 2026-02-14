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
    // Optional: link to a deposit if created from one
    depositId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deposits",
    },
    // Number of people staying
    personInRoom: {
      type: Number,
      default: 1,
    },
    // List of co-residents (if any)
    coResidents: [
      {
        fullName: String,
        dob: Date,
        cccd: String,
        phone: String,
      }
    ],
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    // Duration in months
    duration: {
      type: Number,
      required: true,
      min: 6, // Business Rule: Min 6 months
    },
    status: {
      type: String,
      enum: ["active", "expired", "terminated", "pending"], // added 'terminated' and 'pending'
      default: "active",
    },
    // Services included in this contract (monthly Fixed services)
    services: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
      }
    ],
    // Financial Details (only contract-specific data, not duplicates)
    financials: {
      paymentCycle: { type: Number, default: 1 }, // months
      // Initial payment collected upon signing
      initialPayment: {
        rentAmount: Number, // Rent for remaining days
        depositAmount: Number,
        total: Number,
        paidAt: Date,
        paymentMethod: { type: String, enum: ["cash", "transfer"], default: "cash" }
      }
    },
    // Handover Checklist (Assets) - refs to RoomDevice entries
    assets: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RoomDevice",
      }
    ],
    // Terms & Conditions (Optional snapshot or ref)
    terms: {
      content: String, // Or link to a static terms file
    },
    images: [String], // Photos of contract or room state
  },
  {
    timestamps: true,
  }
);

const Contract = mongoose.model("Contracts", contractSchema, "contracts");
module.exports = Contract;
