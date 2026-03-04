const mongoose = require("mongoose");

// Sub-schema cho từng dịch vụ trong mảng
const bookedServiceItemSchema = new mongoose.Schema(
  {
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: [true, "Dịch vụ đăng ký là bắt buộc"],
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, "Số lượng ít nhất phải là 1"],
    },
  },
  { _id: false }
);

// Schema chính: 1 document per contract, chứa mảng services
const bookServiceSchema = new mongoose.Schema(
  {
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contracts",
      required: [true, "Hợp đồng đăng ký là bắt buộc"],
      unique: true, // Mỗi hợp đồng chỉ có 1 bản ghi BookService
    },
    services: {
      type: [bookedServiceItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.BookService || mongoose.model("BookService", bookServiceSchema);