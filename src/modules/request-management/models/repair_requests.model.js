const mongoose = require("mongoose");
const { Schema } = mongoose;

const RepairRequestSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  devicesId: {
    type: Schema.Types.ObjectId,
    ref: "Device",
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ["Sửa chữa", "Bảo trì"],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  images: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ["Pending", "Processing", "Done"],
    required: true,
    default: "Pending"
  },
  cost: {
    type: Number,
    default: 0
  },
  createdDate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: false });

const RepairRequest = mongoose.model(
  "RepairRequest",
  RepairRequestSchema,
  "repair_requests"
);

module.exports = RepairRequest;
