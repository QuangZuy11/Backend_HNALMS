// Schema: room_id, month, electric_old, electric_new, water_old, water_new
const mongoose = require("mongoose");

const meterReadingSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true
    },
    utilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service", // Liên kết đến bảng Service (chứa dịch vụ Điện, Nước)
      required: true
    },
    oldIndex: {
      type: Number,
      required: true,
      default: 0
    },
    newIndex: {
      type: Number,
      required: true
    },
    usageAmount: {
      type: Number,
      required: true,
      default: 0 // Sẽ được tự động tính: newIndex - oldIndex
    },
    readingDate: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("MeterReading", meterReadingSchema);