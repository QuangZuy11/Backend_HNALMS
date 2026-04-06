const mongoose = require("mongoose");
const { Schema } = mongoose;

const prepaidRentRequestSchema = new Schema(
  {
    // Người thuê yêu cầu
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Hợp đồng liên quan
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contracts",
      required: true,
    },
    // Số tháng đóng trước (min: 1; hợp đồng > 6 tháng: tối thiểu 2 — validate ở service)
    prepaidMonths: {
      type: Number,
      required: true,
      min: 1,
    },
    // Số tiền = prepaidMonths × giá phòng
    totalAmount: {
      type: Number,
      required: true,
    },
    // ID hóa đơn trả trước (InvoiceIncurred) được tạo khi thanh toán thành công
    invoiceIncurredId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InvoiceIncurred",
      default: null,
    },
    // Payment record (sepay)
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    // Trạng thái yêu cầu
    status: {
      type: String,
      enum: ["pending", "paid", "cancelled", "expired"],
      default: "pending",
    },
    // Mã giao dịch sepay
    transactionCode: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Index để tìm kiếm nhanh
prepaidRentRequestSchema.index({ tenantId: 1, status: 1 });
prepaidRentRequestSchema.index({ contractId: 1 });
prepaidRentRequestSchema.index({ paymentId: 1 });

const PrepaidRentRequest = mongoose.model(
  "PrepaidRentRequest",
  prepaidRentRequestSchema,
  "prepaid_rent_requests"
);
module.exports = PrepaidRentRequest;
