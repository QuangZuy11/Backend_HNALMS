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

  // Trạng thái: Requested → Completed (hoặc Cancelled)
  status: {
    type: String,
    enum: ['Requested', 'Completed', 'Cancelled'],
    default: 'Requested'
  },

  // Kiểm tra unhappy case
  isEarlyNotice: {
    type: Boolean,
    default: false // Báo trả phòng < 30 ngày trước hạn
  },
  isUnderMinStay: {
    type: Boolean,
    default: false // Thời gian ở < 3 tháng
  },
  isDepositForfeited: {
    type: Boolean,
    default: false // Mất cọc không
  },

  // Tiền cọc hoàn
  depositRefund: {
    type: Number,
    default: 0
  },

  // Xác nhận hoàn tất
  completedDate: {
    type: Date,
    default: null
  },
  managerCompletionNotes: {
    type: String,
    maxlength: 1000
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

