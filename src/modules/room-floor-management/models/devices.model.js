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
    // Mô tả chi tiết (Kích thước, công suất, v.v.)
    description: {
      type: String,
      default: "",
    },
    // Hình ảnh thiết bị (nếu cần hiển thị mẫu)
    image: {
      type: String,
      default: ""
    },
    // Trạng thái quản lý (Soft delete - Thay vì xóa hẳn thì ẩn đi)
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // Tự động tạo createdAt, updatedAt
  }
);

const Device = mongoose.model("Device", deviceSchema);

module.exports = Device;