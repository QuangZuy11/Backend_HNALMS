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
    // Duration in months
    duration: {
      type: Number,
      required: true,
      min: 6, // Business Rule: Min 6 months
    },
    status: {
      type: String,
      enum: ["active", "expired", "terminated", "pending"],
      default: "active",
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
