/**
 * Model Thiết bị (Device)
 * Vai trò: Danh mục/Kho tài sản gốc (Catalog).
 * Lưu trữ định nghĩa về các loại thiết bị có trong hệ thống.
 */
const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    // Tên thiết bị (VD: Điều hòa Panasonic 1HP)
    name: {
      type: String,
      required: true,
      trim: true
    },
    // Thương hiệu (VD: Panasonic, Samsung) - Theo ERD
    brand: {
      type: String,
      default: "",
      trim: true
    },
    // Mã Model/Series (VD: PU9TKH-8) - Theo ERD
    model: {
      type: String,
      default: "",
      trim: true
    },
    category: {
      type: String,
      default: "",
      trim: true
    },
    unit: {
      type: String,
      default: "Cái",
      trim: true
    },
    price: { 
          type: mongoose.Schema.Types.Decimal128, 
          required: true, 
          default: 0 
      },
    // Mô tả chi tiết (Kích thước, công suất, v.v.)
    description: {
      type: String,
      default: "",
    },

  },
  {
    timestamps: true, // Tự động tạo createdAt, updatedAt
  }
);

// Getter convert Decimal128 -> Number
deviceSchema.set("toJSON", {
  virtuals: true,
  getters: true,
  transform: (doc, ret) => {
    if (ret.price) ret.price = parseFloat(ret.price.toString());
    delete ret.id;
    return ret;
  },
});

const Device = mongoose.model("Device", deviceSchema);

module.exports = Device;