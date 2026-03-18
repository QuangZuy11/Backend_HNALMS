const mongoose = require("mongoose");
const { Schema } = mongoose;

const ContractNotificationLogSchema = new Schema({
    contractId: {
        type: Schema.Types.ObjectId,
        ref: "Contracts",
        required: true
    },
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    notificationId: {
        type: Schema.Types.ObjectId,
        ref: "Notification",
        required: true
    },
    reminderType: {
        type: String,
        enum: ["1_month", "2_weeks", "1_week"],
        required: true
    },
    sentAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: "contract_notification_logs"
});

// Index để query nhanh - đảm bảo không gửi trùng notification
ContractNotificationLogSchema.index({ contractId: 1, reminderType: 1 }, { unique: true });
ContractNotificationLogSchema.index({ tenantId: 1 });
ContractNotificationLogSchema.index({ sentAt: -1 });

const ContractNotificationLog = mongoose.model("ContractNotificationLog", ContractNotificationLogSchema);

module.exports = ContractNotificationLog;
