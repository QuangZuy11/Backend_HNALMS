const notificationService = require('../services/notification.service');
const User = require('../../authentication/models/user.model');

class NotificationController {

    // [Owner] Tạo thông báo nháp
    async createDraftNotification(req, res) {
        try {
            const { title, content } = req.body;
            const userId = req.user.userId;
            const userRole = req.user.role;

            // Chỉ Owner hoặc Manager mới được tạo thông báo
            if (userRole !== 'owner' && userRole !== 'manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Owner hoặc Manager mới có quyền tạo thông báo'
                });
            }

            const notification = await notificationService.createDraftNotification(
                userId,
                userRole,
                title,
                content
            );

            res.status(201).json({
                success: true,
                message: 'Tạo thông báo nháp thành công',
                data: notification
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // [Owner] Cập nhật thông báo nháp
    async updateDraftNotification(req, res) {
        try {
            const { notificationId } = req.params;
            const { title, content } = req.body;
            const userId = req.user.userId;
            const userRole = req.user.role;

            // Chỉ Owner hoặc Manager mới được sửa thông báo
            if (userRole !== 'owner' && userRole !== 'manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Owner hoặc Manager mới có quyền sửa thông báo'
                });
            }

            const notification = await notificationService.updateDraftNotification(
                notificationId,
                userId,
                title,
                content
            );

            res.status(200).json({
                success: true,
                message: 'Cập nhật thông báo nháp thành công',
                data: notification
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // [Owner] Xóa thông báo nháp
    async deleteDraftNotification(req, res) {
        try {
            const { notificationId } = req.params;
            const userId = req.user.userId;
            const userRole = req.user.role;

            // Chỉ Owner hoặc Manager mới được xóa thông báo nháp
            if (userRole !== 'owner' && userRole !== 'manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Owner hoặc Manager mới có quyền xóa thông báo nháp'
                });
            }

            const result = await notificationService.deleteDraftNotification(notificationId, userId);

            res.status(200).json({
                success: true,
                message: result.message
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // [Owner] Phát hành thông báo (chuyển từ draft sang sent)
    async publishNotification(req, res) {
        try {
            const { notificationId } = req.params;
            const userId = req.user.userId;
            const userRole = req.user.role;

            // Chỉ Owner hoặc Manager mới được phát hành thông báo
            if (userRole !== 'owner' && userRole !== 'manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Owner hoặc Manager mới có quyền phát hành thông báo'
                });
            }

            const notification = await notificationService.publishNotification(notificationId, userId);

            res.status(200).json({
                success: true,
                message: 'Phát hành thông báo thành công',
                data: notification
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // [Owner] Lấy danh sách thông báo nháp
    async getMyDraftNotifications(req, res) {
        try {
            const userId = req.user.userId;
            const userRole = req.user.role;
            const { page = 1, limit = 20 } = req.query;

            // Chỉ Owner hoặc Manager mới có thông báo nháp
            if (userRole !== 'owner' && userRole !== 'manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Owner hoặc Manager mới có chức năng quản lý thông báo nháp'
                });
            }

            const result = await notificationService.getOwnerDraftNotifications(
                userId,
                parseInt(page),
                parseInt(limit)
            );

            res.status(200).json({
                success: true,
                message: 'Lấy danh sách thông báo nháp thành công',
                data: result
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Lấy danh sách thông báo theo role
    async getMyNotifications(req, res) {
        try {
            const userId = req.user.userId;
            const userRole = req.user.role;
            const { page = 1, limit = 20, is_read, status, outbound, search, fromDate, toDate } = req.query;

            const result = await notificationService.getUserNotifications(
                userId,
                userRole,
                parseInt(page),
                parseInt(limit),
                is_read !== undefined ? is_read === 'true' : null,
                status,
                outbound === 'true',
                search,
                fromDate,
                toDate
            );

            res.status(200).json({
                success: true,
                message: 'Lấy danh sách thông báo thành công',
                data: result
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // [Manager/Accountant] Đánh dấu thông báo đã đọc
    async markAsRead(req, res) {
        try {
            const { notificationId } = req.params;
            const userId = req.user.userId;
            const userRole = req.user.role;

            // Chỉ Manager/Accountant mới có thể đánh dấu đã đọc
            if (userRole !== 'manager' && userRole !== 'accountant') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Manager và Accountant mới có thể đánh dấu thông báo đã đọc'
                });
            }

            const notification = await notificationService.markAsRead(notificationId, userId);

            res.status(200).json({
                success: true,
                message: 'Đánh dấu đã đọc thành công',
                data: notification
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // [Manager/Accountant] Đánh dấu tất cả thông báo đã đọc
    async markAllAsRead(req, res) {
        try {
            const userId = req.user.userId;
            const userRole = req.user.role;

            // Chỉ Manager/Accountant mới có thể đánh dấu tất cả đã đọc
            if (userRole !== 'manager' && userRole !== 'accountant') {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ Manager và Accountant mới có thể đánh dấu tất cả thông báo đã đọc'
                });
            }

            const result = await notificationService.markAllAsRead(userId);

            res.status(200).json({
                success: true,
                message: result.message
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // [Manager/Accountant] Lấy số lượng thông báo chưa đọc
    async getUnreadCount(req, res) {
        try {
            const userId = req.user.userId;
            const userRole = req.user.role;

            const result = await notificationService.getUnreadCount(userId, userRole);

            res.status(200).json({
                success: true,
                message: 'Lấy số thông báo chưa đọc thành công',
                data: result
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = new NotificationController();
