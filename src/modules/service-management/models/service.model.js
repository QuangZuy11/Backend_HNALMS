const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: [true, "Tên dịch vụ là bắt buộc"], 
      unique: true, // Tên dịch vụ không được trùng
      trim: true
    },
    currentPrice: { 
      type: Number, 
      required: [true, "Giá dịch vụ là bắt buộc"],
      min: [0, "Giá dịch vụ không được âm"],
      default: 0
    },
    description: { 
      type: String, 
      default: "" 
    },
    type: { 
      type: String, 
      enum: {
        values: ["Extension", "Fixed"], 
        message: "Loại dịch vụ phải là 'Extension' (Phụ trội/Theo giờ) hoặc 'Fixed' (Cố định/Theo lượt)"
      },
      required: [true, "Loại dịch vụ là bắt buộc"]
    },
    isActive: { // Thêm trường này để có thể tạm ngưng dịch vụ mà không cần xóa
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true, // Tự động tạo createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// (Tùy chọn) Virtual field nếu muốn link ngược lại pricehistory sau này
// serviceSchema.virtual('priceHistories', {
//   ref: 'PriceHistory',
//   localField: '_id',
//   foreignField: 'servicesid'
// });

module.exports = mongoose.models.Service || mongoose.model("Service", serviceSchema);