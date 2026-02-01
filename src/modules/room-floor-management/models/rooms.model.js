/**
 * Model Phòng (Rooms)
 * Quản lý thông tin phòng, trạng thái và tài sản bên trong
 */
const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // VD: P101, P102
    },
    floorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Floor",
      required: true,
    },
    roomTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomType",
      required: true,
    },
    // Trạng thái phòng theo nghiệp vụ
    status: {
      type: String,
      enum: ["Available", "Occupied", "Maintenance"],
      default: "Available",
    },
    description: {
      type: String,
      default: "",
    },
    // Danh sách tài sản thực tế được lắp trong phòng
    assets: [
      {
        deviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Device", // Tham chiếu tới kho thiết bị gốc
          required: true,
        },
        name: {
          type: String, // Lưu snapshot tên thiết bị
        },
        quantity: {
          type: Number,
          default: 1,
        },
        condition: {
          type: String,
          enum: ["Good", "Broken", "Maintenance"],
          default: "Good",
        },
        installedDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Dùng để quản lý trạng thái hiển thị trên hệ thống (soft delete)
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Room = mongoose.model("Room", roomSchema);

module.exports = Room;