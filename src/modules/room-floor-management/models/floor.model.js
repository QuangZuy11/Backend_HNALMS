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
  },
  {
    timestamps: true,
  }
);

const Floor = mongoose.model("Floor", floorSchema);

module.exports = Floor;