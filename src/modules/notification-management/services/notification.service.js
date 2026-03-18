const Notification = require('../models/notification.model');
const User = require('../../authentication/models/user.model');
const mongoose = require('mongoose');

class NotificationService {

    // Tạo thông báo nháp
    async createDraftNotification(userId, userRole, title, content) {
        try {
            const normalizedRole = (userRole || '').toLowerCase();
            const type = normalizedRole === 'owner' ? 'staff' : 'tenant';
            const notification = new Notification({
                title,
                content,
                type: type,
                status: 'draft',
                created_by: userId,
                recipients: [] // Sẽ được tạo khi publish
            });

            await notification.save();
            return notification;
        } catch (error) {
            throw new Error(`Lỗi tạo thông báo nháp: ${error.message}`);
        }
    }

    // Cập nhật thông báo nháp
    async updateDraftNotification(notificationId, userId, title, content) {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                created_by: userId,
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

    // Xóa thông báo nháp
    async deleteDraftNotification(notificationId, userId) {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                created_by: userId,
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

    // Phát hành thông báo (chuyển từ draft sang sent)
    async publishNotification(notificationId, userId) {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                created_by: userId,
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
    async getUserNotifications(userId, userRole, page = 1, limit = 20, isRead = null, status = null, outbound = false, search = null, fromDate = null, toDate = null) {
        try {
            const normalizedRole = (userRole || '').toLowerCase();
            const skip = (page - 1) * limit;
            let matchCondition = {};

            if (normalizedRole === 'owner' || (normalizedRole === 'manager' && outbound)) {
                // Owner hoặc Manager xem tất cả thông báo do mình tạo (draft + sent), có thể filter theo status
                matchCondition = { created_by: new mongoose.Types.ObjectId(userId) };

                if (status) {
                    matchCondition.status = status;
                }

                if (search) {
                    matchCondition.title = { $regex: search, $options: 'i' };
                }
                
                if (fromDate || toDate) {
                    matchCondition.createdAt = {};
                    if (fromDate) matchCondition.createdAt.$gte = new Date(fromDate);
                    if (toDate) matchCondition.createdAt.$lte = new Date(toDate);
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

            } else if (normalizedRole === 'manager' || normalizedRole === 'accountant') {
                // Manager/Accountant xem thông báo staff đã được gửi
                matchCondition = {
                    type: 'staff',
                    status: 'sent',
                    'recipients.recipient_id': new mongoose.Types.ObjectId(userId)
                };

                if (isRead !== null) {
                    matchCondition['recipients.is_read'] = isRead;
                }

                if (search) {
                    matchCondition.title = { $regex: search, $options: 'i' };
                }
                
                if (fromDate || toDate) {
                    matchCondition.createdAt = {};
                    if (fromDate) matchCondition.createdAt.$gte = new Date(fromDate);
                    if (toDate) matchCondition.createdAt.$lte = new Date(toDate);
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
            } else if (normalizedRole === 'tenant') {
                // Tenant xem thông báo:
                // 1. type = 'tenant' (từ Manager) cho TẤT CẢ tenant
                // 2. type = 'system' VÀ recipient_id = tenantId (thông báo hệ thống gửi cho tenant cụ thể)
                const orConditions = [
                    { type: 'tenant', status: 'sent' },
                    { type: 'system', status: 'sent', 'recipients.recipient_id': userId }
                ];

                matchCondition = {
                    $or: orConditions
                };

                if (search) {
                    matchCondition.title = { $regex: search, $options: 'i' };
                }

                if (fromDate || toDate) {
                    matchCondition.createdAt = {};
                    if (fromDate) matchCondition.createdAt.$gte = new Date(fromDate);
                    if (toDate) matchCondition.createdAt.$lte = new Date(toDate);
                }

                // Sử dụng aggregate để lấy thông báo và kiểm tra is_read cho từng tenant
                const notifications = await Notification.aggregate([
                    { $match: matchCondition },
                    {
                        $addFields: {
                            recipient_info: {
                                $arrayElemAt: [
                                    {
                                        $filter: {
                                            input: '$recipients',
                                            cond: { $eq: ['$$this.recipient_id', userId] }
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
                            is_read: { $ifNull: ['$recipient_info.is_read', false] },
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

    // Lấy danh sách thông báo nháp
    async getMyDraftNotifications(userId, page = 1, limit = 20) {
        try {
            const skip = (page - 1) * limit;
            const matchCondition = {
                created_by: userId,
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
            const normalizedRole = (userRole || '').toLowerCase();

            if (normalizedRole === 'manager' || normalizedRole === 'accountant') {
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
