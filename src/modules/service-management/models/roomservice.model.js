const mongoose = require("mongoose");

const roomServiceSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room", // Liên kết đến bảng Phòng
      required: [true, "Phòng đăng ký là bắt buộc"],
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service", // Liên kết đến bảng Service bạn vừa đưa
      required: [true, "Dịch vụ đăng ký là bắt buộc"],
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, "Số lượng ít nhất phải là 1"], // Dùng cho trường hợp đăng ký 2 vé xe, 2 người...
    },
    startDate: {
      type: Date,
      required: [true, "Ngày bắt đầu là bắt buộc"],
      default: Date.now,
    },
    endDate: {
      type: Date,
      // Có thể null. Nếu null nghĩa là dịch vụ gia hạn hàng tháng cho đến khi khách báo hủy
    },
    status: {
      type: String,
      enum: ["Active", "Canceled"],
      default: "Active",
      /* - Active: Đang sử dụng (sẽ bị tính tiền khi tạo hóa đơn hàng tháng)
        - Canceled: Khách báo hủy giữa chừng
        - Completed: Dịch vụ đã kết thúc (đã qua endDate)
      */
    },
    note: {
      type: String, // Ghi chú thêm (VD: Biển số xe: 29A1-12345)
      default: "",
    },
  },
  {
    timestamps: true, // Tự động có createdAt, updatedAt
  }
);

// Đảm bảo 1 phòng không đăng ký trùng 1 dịch vụ đang Active (Tùy chọn, nếu bạn muốn chặn)
 roomServiceSchema.index({ roomId: 1, serviceId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'Active' } });

module.exports = mongoose.models.RoomService || mongoose.model("RoomService", roomServiceSchema);