const mongoose = require("mongoose");
const { Schema } = mongoose;

const NotificationSchema = new Schema({
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    content: {
        type: String,
        required: true,
        maxlength: 1000
    },
    type: {
        type: String,
        enum: [
            'staff',        // Thông báo từ owner cho staff (manager + accountant)
            'system',       // Thông báo hệ thống (thanh toán, hợp đồng, bảo trì)
            'tenant'        // Thông báo từ manager cho tenant
        ],
        default: 'staff'
    },
    status: {
        type: String,
        enum: ['draft', 'sent', 'archived'],
        default: 'draft'
    },
    created_by: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Chỉ tạo recipients khi status = 'sent'
    recipients: [{
        recipient_id: { type: Schema.Types.ObjectId, ref: 'User' },
        recipient_role: { type: String, enum: ['manager', 'accountant', 'tenant'] },
        is_read: { type: Boolean, default: false },
        read_at: { type: Date, default: null }
    }]
}, {
    timestamps: true,
    collection: 'notifications'
});

// Indexes để tối ưu hiệu suất
NotificationSchema.index({ type: 1, status: 1 });
NotificationSchema.index({ created_by: 1, status: 1 });
NotificationSchema.index({ 'recipients.recipient_id': 1, 'recipients.is_read': 1 });
NotificationSchema.index({ createdAt: -1 });

// Virtual để đếm số thông báo chưa đọc
NotificationSchema.virtual('unread_count').get(function () {
    return this.recipients.filter(r => !r.is_read).length;
});

// Phương thức đánh dấu đã đọc cho người dùng cụ thể
NotificationSchema.methods.markAsRead = function (userId) {
    const recipient = this.recipients.find(r => r.recipient_id.toString() === userId.toString());
    if (recipient) {
        recipient.is_read = true;
        recipient.read_at = new Date();
    }
    return this.save();
};

// Phương thức phát hành thông báo (chuyển từ draft sang sent)
NotificationSchema.methods.publishNotification = async function () {
    if (this.status !== 'draft') {
        throw new Error('Chỉ có thể phát hành thông báo ở trạng thái nháp');
    }

    if (this.type === 'staff') {
        const User = require('../../authentication/models/user.model');
        const targetUsers = await User.find({
            role: { $in: ['manager', 'accountant'] },
            status: 'active'
        }).select('_id role');
        if (targetUsers.length === 0) {
            throw new Error('Không tìm thấy Manager hoặc Accountant nào để gửi thông báo');
        }
        this.recipients = targetUsers.map(user => ({
            recipient_id: user._id,
            recipient_role: user.role,
            is_read: false,
            read_at: null
        }));
    } else if (this.type === 'tenant') {
        // Không cần tạo recipients, chỉ đổi trạng thái
        this.recipients = [];
    } else {
        throw new Error('Loại thông báo không hợp lệ để phát hành thủ công');
    }

    this.status = 'sent';
    return this.save();
};

const Notification = mongoose.model("Notification", NotificationSchema, "notifications");

module.exports = Notification;
