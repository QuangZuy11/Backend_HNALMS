const mongoose = require("mongoose");
const { Schema } = mongoose;

const MoveOutRequestSchema = new Schema({
  // Foreign Keys
  contractId: {
    type: Schema.Types.ObjectId,
    ref: 'Contracts',
    required: true,
    unique: true // Mỗi hợp đồng chỉ có 1 yêu cầu trả phòng
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Thông tin yêu cầu
  requestDate: {
    type: Date,
    default: () => new Date(),
    required: true
  },
  expectedMoveOutDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    maxlength: 500
  },

  /**
   * Luồng trạng thái (theo flowchart Tenant Terminate Contract):
   *  Requested → InvoiceReleased → Paid → Completed
   *                                      ↘ Cancelled (hủy bất kỳ lúc nào trước Paid)
   */
  status: {
    type: String,
    enum: ['Requested', 'InvoiceReleased', 'Paid', 'Completed'],
    default: 'Requested'
  },

  // === Kiểm tra điều kiện hoàn cọc ===
  isEarlyNotice: {
    type: Boolean,
    default: false // true khi khoảng cách từ requestDate đến endDate < 30 ngày
  },
  isUnderMinStay: {
    type: Boolean,
    default: false // true khi thời gian thuê < 3 tháng
  },
  isDepositForfeited: {
    type: Boolean,
    default: false // true → mất cọc (không đủ điều kiện hoàn)
  },

  // === Thông tin gap contract ===
  // 🆕 Cờ xác định yêu cầu trả phòng này thuộc gap contract
  // Gap contract = người thuê trong khoảng trống, LUÔN được hoàn cọc
  isGapContract: {
    type: Boolean,
    default: false
  },

  // === Thông tin hóa đơn cuối ===
  finalInvoiceId: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice',
    default: null
  },

  // === Thông tin hoàn/bù cọc ===
  depositRefundAmount: {
    type: Number,
    default: 0 // Số tiền cọc được hoàn lại cho tenant (sau khi trừ hóa đơn nếu có)
  },

  // === Thông tin thanh toán ===
  paymentMethod: {
    type: String,
    enum: ['online', 'offline', null],
    default: null
  },
  paymentTransactionCode: {
    type: String,
    default: null
  },
  paymentDate: {
    type: Date,
    default: null
  },

  // === Ghi chú từng bước ===
  managerInvoiceNotes: {
    type: String,
    maxlength: 1000
  },
  accountantNotes: {
    type: String,
    maxlength: 1000
  },
  managerCompletionNotes: {
    type: String,
    maxlength: 1000
  },

  // Ngày hoàn tất
  completedDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'moveout_requests'
});

// Index
MoveOutRequestSchema.index({ contractId: 1 });
MoveOutRequestSchema.index({ tenantId: 1 });
MoveOutRequestSchema.index({ status: 1 });

const MoveOutRequest = mongoose.model("MoveOutRequest", MoveOutRequestSchema);

module.exports = MoveOutRequest;
