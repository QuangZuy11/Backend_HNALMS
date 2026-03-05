/**
 * Model RoomDevice (Bảng trung gian)
 * Quy định tiêu chuẩn: 1 Loại phòng thì có những thiết bị gì
 */
const mongoose = require("mongoose");

const roomDeviceSchema = new mongoose.Schema(
  {
    roomTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomType",
      required: true,
    },
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Device",
      required: true,
    },
    quantity: {
      type: Number,
      default: 1, // VD: 1 phòng có 2 cái đèn
    }
  },
  {
    timestamps: true,
  }
);

const RoomDevice = mongoose.model("RoomDevice", roomDeviceSchema);
module.exports = RoomDevice;