const mongoose = require("mongoose");
const { Schema } = mongoose;

const contractSchema = new Schema(
  {
    contractCode: {
      type: String,
      required: true,
      unique: true,
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
    depositCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deposits",
    },
    personInRoom: {
      type: Number,
      default: 1,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    image: [String],
  },
  {
    timestamps: true,
  }
);

const Contract = mongoose.model("Contracts", contractSchema, "contracts");
module.exports = Contract;
