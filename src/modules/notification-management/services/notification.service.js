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
                // Manager/Accountant xem thông báo staff + system đã được gửi
                matchCondition = {
                    type: { $in: ['staff', 'system'] },  // ✅ Xem cả staff và system
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
                    type: { $in: ['staff', 'system'] },  // ✅ Đếm cả staff và system
                    status: 'sent',
                    'recipients': {
                        $elemMatch: {
                            recipient_id: userId,
                            is_read: false
                        }
                    }
                });
                return { unread_count: count };
            } else if (normalizedRole === 'tenant') {
                // Tenant đếm thông báo chưa đọc: type = 'tenant' + type = 'system' gửi cho tenant đó
                const count = await Notification.countDocuments({
                    $or: [
                        // Thông báo từ Manager cho tất cả tenant
                        { type: 'tenant', status: 'sent' },
                        // Thông báo hệ thống gửi cho tenant cụ thể
                        { type: 'system', status: 'sent', 'recipients.recipient_id': userId, 'recipients.is_read': false }
                    ]
                });
                return { unread_count: count };
            }

            return { unread_count: 0 };
        } catch (error) {
            throw new Error(`Lỗi đếm thông báo chưa đọc: ${error.message}`);
        }
    }

    // Tạo thông báo hệ thống tự động khi tenant gửi request (sửa chữa, khiếu nại, chuyển phòng)
    async createSystemNotificationForRequest(tenantId, requestType, requestData) {
        try {
            console.log(`🔔 [NOTIFICATION] Tạo notification cho request type: ${requestType}, tenantId: ${tenantId}`);
            
            // Lấy thông tin tenant
            const tenant = await User.findById(tenantId).select('fullName');
            if (!tenant) {
                console.error(`❌ [NOTIFICATION] Không tìm thấy tenant: ${tenantId}`);
                throw new Error('Không tìm thấy thông tin tenant');
            }
            console.log(`✅ [NOTIFICATION] Tenant found: ${tenant.fullName}`);

            // Tạo tiêu đề và nội dung dựa vào loại request
            let title, content;
            if (requestType === 'repair') {
                const { type, roomName, description } = requestData;
                title = `📋 Yêu cầu ${type} từ ${tenant.fullName}`;
                content = `Phòng: ${roomName}\nLoại: ${type}\nMô tả: ${description}`;
            } else if (requestType === 'complaint') {
                const { category, complaintContent } = requestData;
                title = `⚠️ Khiếu nại (${category}) từ ${tenant.fullName}`;
                content = complaintContent;
            } else if (requestType === 'transfer') {
                const { currentRoomName, targetRoomName, reason, transferDate } = requestData;
                title = `🏠 Yêu cầu chuyển phòng từ ${tenant.fullName}`;
                content = `Từ phòng: ${currentRoomName}\nSang phòng: ${targetRoomName}\nNgày chuyển: ${new Date(transferDate).toLocaleDateString('vi-VN')}\nLý do: ${reason}`;
            } else {
                throw new Error('Loại request không hợp lệ');
            }

            // Lấy tất cả manager có trạng thái active
            const managers = await User.find({ 
                role: 'manager', 
                status: 'active' 
            }).select('_id');
            
            console.log(`🔍 [NOTIFICATION] Tìm thấy ${managers.length} manager(s) active`);
            if (managers.length === 0) {
                console.warn('⚠️ [NOTIFICATION] Không tìm thấy manager nào để gửi thông báo');
                return null;
            }

            // Tạo notification đã gửi ngay (status = 'sent')
            const notification = new Notification({
                title,
                content,
                type: 'system',
                status: 'sent',
                created_by: null, // Thông báo từ hệ thống
                recipients: managers.map(manager => ({
                    recipient_id: manager._id,
                    recipient_role: 'manager',
                    is_read: false,
                    read_at: null
                }))
            });

            await notification.save();
            console.log(`✅ [NOTIFICATION] Đã tạo thông báo hệ thống (ID: ${notification._id}) cho ${managers.length} manager`);
            console.log(`📨 [NOTIFICATION] Title: ${title}`);
            return notification;
        } catch (error) {
            console.error(`❌ [NOTIFICATION ERROR] ${error.message}`);
            console.error(`❌ [NOTIFICATION STACK] ${error.stack}`);
            // Không throw để không làm ảnh hưởng đến việc tạo request
            return null;
        }
    }

    // Tạo thông báo hệ thống khi tenant có hóa đơn mới
    async createInvoiceNotification(tenantId, invoiceType, invoiceData) {
        try {
            console.log(`[INVOICE NOTIFICATION] 📌 Bắt đầu tạo notification...`);
            console.log(`[INVOICE NOTIFICATION] Input: tenantId=${tenantId}, invoiceType=${invoiceType}, invoiceCode=${invoiceData?.invoiceCode}`);
            
            // Lấy thông tin tenant
            const tenant = await User.findById(tenantId).select('fullName email');
            if (!tenant) {
                console.error(`[INVOICE NOTIFICATION] ❌ Không tìm thấy tenant: ${tenantId}`);
                return null;
            }
            console.log(`[INVOICE NOTIFICATION] ✅ Tìm thấy tenant: ${tenant.fullName}`);

            // Tạo tiêu đề và nội dung dựa vào loại hóa đơn
            let title, content;
            
            if (invoiceType === 'periodic') {
                // Hóa đơn định kỳ (Tiền thuê, điện, nước, wifi)
                const { invoiceCode, title: invoiceTitle, totalAmount, dueDate, items } = invoiceData;
                const itemsList = items?.map(item => `• ${item.itemName}: ${item.amount?.toLocaleString('vi-VN')} đ`).join('\n') || '';
                
                title = `[Hóa Đơn Định Kỳ] ${invoiceCode}`;
                content = `Phòng của bạn có hóa đơn định kỳ:\n\n${itemsList}\n\nTổng tiền: ${totalAmount?.toLocaleString('vi-VN')} đ\nHạn thanh toán: ${new Date(dueDate).toLocaleDateString('vi-VN')}\n\nVui lòng thanh toán đúng hạn.`;
                
            } else if (invoiceType === 'incurred') {
                // Hóa đơn phát sinh (Sửa chữa, vi phạm, cọc)
                const { invoiceCode, title: invoiceTitle, totalAmount, dueDate, type, description } = invoiceData;
                
                let typeLabel = 'Phát Sinh';
                if (type === 'repair') typeLabel = 'Sửa Chữa';
                else if (type === 'violation') typeLabel = 'Vi Phạm';
                else if (type === 'prepaid') typeLabel = 'Cọc';
                
                title = `[Hóa Đơn ${typeLabel}] ${invoiceCode}`;
                content = `Phòng của bạn có hóa đơn ${typeLabel}:\n\n${invoiceTitle}\nTiền: ${totalAmount?.toLocaleString('vi-VN')} đ\nHạn thanh toán: ${new Date(dueDate).toLocaleDateString('vi-VN')}\n\nVui lòng thanh toán đúng hạn.`;
                
            } else {
                console.warn(`[INVOICE NOTIFICATION] ⚠️ Loại hóa đơn không được hỗ trợ: ${invoiceType}`);
                return null;
            }

            console.log(`[INVOICE NOTIFICATION] 📝 Title: ${title}`);

            // Tạo notification - Gửi cho tenant cụ thể (type = 'system')
            const notification = new Notification({
                title,
                content,
                type: 'system',
                status: 'sent',
                created_by: null,
                recipients: [{
                    recipient_id: tenantId,
                    recipient_role: 'tenant',
                    is_read: false,
                    read_at: null
                }]
            });

            console.log(`[INVOICE NOTIFICATION] 💾 Lưu notification vào DB...`);
            const savedNotif = await notification.save();
            console.log(`[INVOICE NOTIFICATION] ✅ THÀNH CÔNG! Notification đã lưu vào DB`);
            console.log(`[INVOICE NOTIFICATION] 🆔 Notification ID: ${savedNotif._id}`);
            console.log(`[INVOICE NOTIFICATION] 👤 Tenant: ${tenant.fullName} (${tenantId})`);
            console.log(`[INVOICE NOTIFICATION] 📧 Email: ${tenant.email}`);
            
            return savedNotif;
            
        } catch (error) {
            console.error(`[INVOICE NOTIFICATION] ❌ LỖI: ${error.message}`);
            console.error(`[INVOICE NOTIFICATION] 📌 Stack trace:`, error.stack);
            // Không throw để không làm ảnh hưởng đến việc tạo hóa đơn
            return null;
        }
    }
}

module.exports = new NotificationService();
