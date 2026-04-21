/**
 * Model Tầng (Floors)
 * Quản lý danh sách các tầng trong tòa nhà
 */
const mongoose = require("mongoose");

const floorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // Tên tầng không được trùng (VD: Tầng 1, Tầng 2)
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    // Kiểu sơ đồ tầng: 'type1' = layout Tầng 1 (lưới đều, sidebar Xe),
    // 'type2' = layout Tầng 2 (lệch 2 bên, có thang máy/khoảng trống),
    // 'type3' = layout Tầng 5 (lưới đều, sidebar Sân Phơi)
    layoutType: {
      type: String,
      enum: ["type1", "type2", "type3"],
      default: "type1",
    },
  },
  {
    timestamps: true,
  }
);

const Floor = mongoose.model("Floor", floorSchema);

module.exports = Floor;