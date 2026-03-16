const Notification = require('../models/notification.model');
const User = require('../../authentication/models/user.model');
const mongoose = require('mongoose');

class NotificationService {

    // [Owner] Tạo thông báo nháp
    async createDraftNotification(ownerId, title, content) {
        try {
            const notification = new Notification({
                title,
                content,
                type: 'staff',
                status: 'draft',
                created_by: ownerId,
                recipients: [] // Sẽ được tạo khi publish
            });

            await notification.save();
            return notification;
        } catch (error) {
            throw new Error(`Lỗi tạo thông báo nháp: ${error.message}`);
        }
    }

    // [Owner] Cập nhật thông báo nháp
    async updateDraftNotification(notificationId, ownerId, title, content) {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                created_by: ownerId,
                status: 'draft'
            });

            if (!notification) {
                throw new Error('Không tìm thấy thông báo nháp hoặc bạn không có quyền chỉnh sửa');
            }

            notification.title = title;
            notification.content = content;

            await notification.save();
            return notification;
        } catch (error) {
            throw new Error(`Lỗi cập nhật thông báo: ${error.message}`);
        }
    }

    // [Owner] Xóa thông báo nháp
    async deleteDraftNotification(notificationId, ownerId) {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                created_by: ownerId,
                status: 'draft'
            });

            if (!notification) {
                throw new Error('Không tìm thấy thông báo nháp hoặc bạn không có quyền xóa');
            }

            await Notification.deleteOne({ _id: notificationId });
            return { message: 'Đã xóa thông báo nháp thành công' };
        } catch (error) {
            throw new Error(`Lỗi xóa thông báo: ${error.message}`);
        }
    }

    // [Owner] Phát hành thông báo (chuyển từ draft sang sent)
    async publishNotification(notificationId, ownerId) {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                created_by: ownerId,
                status: 'draft'
            });

            if (!notification) {
                throw new Error('Không tìm thấy thông báo nháp hoặc bạn không có quyền phát hành');
            }

            await notification.publishNotification();
            return notification;
        } catch (error) {
            throw new Error(`Lỗi phát hành thông báo: ${error.message}`);
        }
    }

    // Lấy danh sách thông báo theo role
    async getUserNotifications(userId, userRole, page = 1, limit = 20, isRead = null, status = null) {
        try {
            const skip = (page - 1) * limit;
            let matchCondition = {};

            if (userRole === 'owner') {
                // Owner xem tất cả thông báo do mình tạo (draft + sent), có thể filter theo status
                matchCondition = { created_by: new mongoose.Types.ObjectId(userId) };

                if (status) {
                    matchCondition.status = status;
                }

                const notifications = await Notification.find(matchCondition)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .select('title content type status createdAt updatedAt');

                const total = await Notification.countDocuments(matchCondition);

                // Đếm số lượng theo từng trạng thái để FE hiển thị tab badge
                const [draftCount, sentCount] = await Promise.all([
                    Notification.countDocuments({ created_by: new mongoose.Types.ObjectId(userId), status: 'draft' }),
                    Notification.countDocuments({ created_by: new mongoose.Types.ObjectId(userId), status: 'sent' })
                ]);

                return {
                    notifications,
                    summary: {
                        draft_count: draftCount,
                        sent_count: sentCount
                    },
                    pagination: {
                        current_page: page,
                        total_pages: Math.ceil(total / limit),
                        total_count: total,
                        limit
                    }
                };

            } else if (userRole === 'manager' || userRole === 'accountant') {
                // Manager/Accountant xem thông báo staff đã được gửi
                matchCondition = {
                    type: 'staff',
                    status: 'sent',
                    'recipients.recipient_id': new mongoose.Types.ObjectId(userId)
                };

                if (isRead !== null) {
                    matchCondition['recipients.is_read'] = isRead;
                }

                const notifications = await Notification.aggregate([
                    { $match: matchCondition },
                    {
                        $addFields: {
                            recipient_info: {
                                $arrayElemAt: [
                                    {
                                        $filter: {
                                            input: '$recipients',
                                            cond: { $eq: ['$$this.recipient_id', new mongoose.Types.ObjectId(userId)] }
                                        }
                                    },
                                    0
                                ]
                            }
                        }
                    },
                    {
                        $project: {
                            title: 1,
                            content: 1,
                            type: 1,
                            status: 1,
                            createdAt: 1,
                            is_read: '$recipient_info.is_read',
                            read_at: '$recipient_info.read_at'
                        }
                    },
                    { $sort: { createdAt: -1 } },
                    { $skip: skip },
                    { $limit: limit }
                ]);

                const total = await Notification.countDocuments(matchCondition);

                return {
                    notifications,
                    pagination: {
                        current_page: page,
                        total_pages: Math.ceil(total / limit),
                        total_count: total,
                        limit
                    }
                };
            } else {
                throw new Error('Role không hợp lệ');
            }

        } catch (error) {
            throw new Error(`Lỗi lấy danh sách thông báo: ${error.message}`);
        }
    }

    // [Owner] Lấy danh sách thông báo nháp
    async getOwnerDraftNotifications(ownerId, page = 1, limit = 20) {
        try {
            const skip = (page - 1) * limit;
            const matchCondition = {
                created_by: ownerId,
                status: 'draft'
            };

            const notifications = await Notification.find(matchCondition)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('title content createdAt updatedAt');

            const total = await Notification.countDocuments(matchCondition);

            return {
                notifications,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_count: total,
                    limit
                }
            };
        } catch (error) {
            throw new Error(`Lỗi lấy danh sách thông báo nháp: ${error.message}`);
        }
    }

    // Đánh dấu thông báo đã đọc (chỉ cho Manager/Accountant)
    async markAsRead(notificationId, userId) {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                status: 'sent',
                'recipients.recipient_id': userId
            });

            if (!notification) {
                throw new Error('Không tìm thấy thông báo');
            }

            await notification.markAsRead(userId);
            return notification;
        } catch (error) {
            throw new Error(`Lỗi đánh dấu đã đọc: ${error.message}`);
        }
    }

    // Đánh dấu tất cả thông báo đã đọc (chỉ cho Manager/Accountant)
    async markAllAsRead(userId) {
        try {
            await Notification.updateMany(
                {
                    status: 'sent',
                    'recipients.recipient_id': userId
                },
                {
                    $set: {
                        'recipients.$.is_read': true,
                        'recipients.$.read_at': new Date()
                    }
                }
            );
            return { message: 'Đã đánh dấu tất cả thông báo là đã đọc' };
        } catch (error) {
            throw new Error(`Lỗi đánh dấu tất cả đã đọc: ${error.message}`);
        }
    }

    // Đếm số thông báo chưa đọc (chỉ cho Manager/Accountant)
    async getUnreadCount(userId, userRole) {
        try {
            if (userRole === 'manager' || userRole === 'accountant') {
                const count = await Notification.countDocuments({
                    type: 'staff',
                    status: 'sent',
                    'recipients': {
                        $elemMatch: {
                            recipient_id: userId,
                            is_read: false
                        }
                    }
                });
                return { unread_count: count };
            }

            return { unread_count: 0 };
        } catch (error) {
            throw new Error(`Lỗi đếm thông báo chưa đọc: ${error.message}`);
        }
    }
}

module.exports = new NotificationService();
