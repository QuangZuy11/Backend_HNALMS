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
                    // Lookup User để lấy thông tin người tạo
                    {
                        $lookup: {
                            from: 'user',
                            localField: 'created_by',
                            foreignField: '_id',
                            as: 'creator'
                        }
                    },
                    // Lookup UserInfo để lấy fullname
                    {
                        $lookup: {
                            from: 'userinfos',
                            localField: 'created_by',
                            foreignField: 'userId',
                            as: 'creatorInfo'
                        }
                    },
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
                            },
                            sender_name: {
                                $ifNull: [
                                    { $arrayElemAt: ['$creatorInfo.fullname', 0] },
                                    { $arrayElemAt: ['$creator.username', 0] },
                                    'Hệ thống'
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
                            sender_name: 1,
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
                // Lấy thông tin tài khoản tenant để filter notification theo ngày tạo
                // Đảm bảo tenant mới không thấy thông báo đã được gửi TRƯỚC khi họ tạo tài khoản
                const tenantUser = await User.findById(userId).select('createdAt');
                const tenantCreatedAt = tenantUser?.createdAt || new Date(0);

                // Filter notifications:
                // 1. type = 'tenant' VÀ notification.createdAt >= tenant.createdAt
                //    (chỉ thông báo được gửi SAU khi tenant tạo tài khoản)
                // 2. type = 'system' VÀ recipient_id = tenantId (thông báo hệ thống gửi cho tenant cụ thể)
                const orConditions = [
                    {
                        type: 'tenant',
                        status: 'sent',
                        createdAt: { $gte: tenantCreatedAt }
                    },
                    {
                        type: 'system',
                        status: 'sent',
                        'recipients.recipient_id': userId
                    }
                ];

                matchCondition = {
                    $or: orConditions
                };

                if (search) {
                    matchCondition.title = { $regex: search, $options: 'i' };
                }

                if (fromDate || toDate) {
                    matchCondition.createdAt = matchCondition.createdAt || {};
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
                // Lấy thông tin tài khoản tenant để filter notification theo ngày tạo
                const tenantUser = await User.findById(userId).select('createdAt');
                const tenantCreatedAt = tenantUser?.createdAt || new Date(0);

                // Tenant đếm thông báo chưa đọc:
                // 1. type = 'tenant' VÀ notification.createdAt >= tenant.createdAt
                // 2. type = 'system' gửi cho tenant cụ thể
                const count = await Notification.countDocuments({
                    $or: [
                        {
                            type: 'tenant',
                            status: 'sent',
                            createdAt: { $gte: tenantCreatedAt }
                        },
                        {
                            type: 'system',
                            status: 'sent',
                            'recipients.recipient_id': userId,
                            'recipients.is_read': false
                        }
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

            // Lấy thông tin tenant và userInfo để có fullname
            const UserInfo = require('../../authentication/models/userInfor.model');
            const tenant = await User.findById(tenantId);
            if (!tenant) {
                console.error(`❌ [NOTIFICATION] Không tìm thấy tenant: ${tenantId}`);
                throw new Error('Không tìm thấy thông tin tenant');
            }

            // Lấy fullname từ UserInfo
            const userInfo = await UserInfo.findOne({ userId: tenantId });
            const displayName = userInfo?.fullname || tenant.username;
            console.log(`✅ [NOTIFICATION] Tenant found: ${displayName}`);

            // Tạo tiêu đề và nội dung dựa vào loại request
            let title, content;
            if (requestType === 'repair') {
                const { type, roomName, description } = requestData;
                title = `Yêu cầu ${type}`;
                content = `${roomName}\nLoại: ${type}\nMô tả: ${description}`;
            } else if (requestType === 'complaint') {
                const { category, complaintContent } = requestData;
                title = `Khiếu nại (${category})`;
                content = complaintContent;
            } else if (requestType === 'transfer') {
                const { currentRoomName, targetRoomName, reason, transferDate } = requestData;
                title = `Yêu cầu chuyển phòng `;
                content = `Từ: ${currentRoomName}\nSang: ${targetRoomName}\nNgày chuyển: ${new Date(transferDate).toLocaleDateString('vi-VN')}\nLý do: ${reason}`;
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
            // created_by = tenantId để có thể lookup fullName từ User -> UserInfo
            const notification = new Notification({
                title,
                content,
                type: 'system',
                status: 'sent',
                created_by: tenantId,
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
                content = `Bạn có hóa đơn định kỳ:\n\n${itemsList}\n\nTổng tiền: ${totalAmount?.toLocaleString('vi-VN')} đ\nHạn thanh toán: ${new Date(dueDate).toLocaleDateString('vi-VN')}\n\nVui lòng thanh toán đúng hạn.`;

            } else if (invoiceType === 'incurred') {
                // Hóa đơn phát sinh (Sửa chữa, vi phạm, cọc)
                const { invoiceCode, title: invoiceTitle, totalAmount, dueDate, type, description } = invoiceData;

                let typeLabel = 'Phát Sinh';
                if (type === 'repair') typeLabel = 'Sửa Chữa';
                else if (type === 'violation') typeLabel = 'Vi Phạm';
                else if (type === 'prepaid') typeLabel = 'Cọc';

                title = `[Hóa Đơn ${typeLabel}] ${invoiceCode}`;
                content = `Bạn có hóa đơn ${typeLabel}:\n\n${invoiceTitle}\nSố Tiền: ${totalAmount?.toLocaleString('vi-VN')} đ\nHạn thanh toán: ${new Date(dueDate).toLocaleDateString('vi-VN')}\n\nVui lòng thanh toán đúng hạn.`;

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

    // Tạo thông báo hóa đơn quá hạn thanh toán
    async createOverdueInvoiceNotification(tenantId, invoiceType, invoiceData) {
        try {
            console.log(`[OVERDUE NOTIFICATION] 📌 Bắt đầu tạo thông báo quá hạn...`);
            console.log(`[OVERDUE NOTIFICATION] Input: tenantId=${tenantId}, invoiceType=${invoiceType}, invoiceCode=${invoiceData?.invoiceCode}`);

            // Lấy thông tin tenant
            const tenant = await User.findById(tenantId).select('fullName email');
            if (!tenant) {
                console.error(`[OVERDUE NOTIFICATION] ❌ Không tìm thấy tenant: ${tenantId}`);
                return null;
            }
            console.log(`[OVERDUE NOTIFICATION] ✅ Tìm thấy tenant: ${tenant.fullName}`);

            // Kiểm tra xem đã gửi thông báo quá hạn cho hóa đơn này chưa
            const existingNotif = await Notification.findOne({
                'recipients.recipient_id': tenantId,
                type: 'system',
                content: { $regex: invoiceData?.invoiceCode || '', $options: 'i' },
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Chỉ check trong vòng 7 ngày
            });
            if (existingNotif) {
                console.log(`[OVERDUE NOTIFICATION] ⏭️ Đã gửi thông báo quá hạn cho hóa đơn ${invoiceData?.invoiceCode} trong tuần này, bỏ qua`);
                return null;
            }

            // Tạo tiêu đề và nội dung dựa vào loại hóa đơn
            let title, content;
            const invoiceCode = invoiceData?.invoiceCode || '';
            const invoiceTitle = invoiceData?.title || invoiceData?.invoiceTitle || '';
            const totalAmount = invoiceData?.totalAmount?.toLocaleString('vi-VN') || '0';
            const dueDate = invoiceData?.dueDate ? new Date(invoiceData.dueDate).toLocaleDateString('vi-VN') : '';
            const daysOverdue = invoiceData?.daysOverdue || 1;

            if (invoiceType === 'periodic') {
                title = `[QUÁ HẠN] Hóa Đơn Định Kỳ ${invoiceCode}`;
                content = `CẢNH BÁO: Hóa đơn định kỳ đã quá hạn thanh toán!\n\n` +
                    `Mã hóa đơn: ${invoiceCode}\n` +
                    `Tiêu đề: ${invoiceTitle}\n` +
                    `Số tiền: ${totalAmount} đ\n` +
                    `Hạn thanh toán: ${dueDate}\n` +
                    `Quá hạn: ${daysOverdue} ngày\n\n` +
                    `Vui lòng thanh toán ngay để tránh bị tính phạt.`;

            } else if (invoiceType === 'incurred') {
                const typeLabel = invoiceData?.type === 'repair' ? 'Sửa Chữa'
                    : invoiceData?.type === 'violation' ? 'Vi Phạm'
                        : invoiceData?.type === 'prepaid' ? 'Cọc' : 'Phát Sinh';
                title = `[QUÁ HẠN] Hóa Đơn ${typeLabel} ${invoiceCode}`;
                content = `CẢNH BÁO: Hóa đơn ${typeLabel.toLowerCase()} đã quá hạn thanh toán!\n\n` +
                    `Mã hóa đơn: ${invoiceCode}\n` +
                    `Tiêu đề: ${invoiceTitle}\n` +
                    `Số tiền: ${totalAmount} đ\n` +
                    `Hạn thanh toán: ${dueDate}\n` +
                    `Quá hạn: ${daysOverdue} ngày\n\n` +
                    `Vui lòng thanh toán ngay để tránh bị tính phạt.`;

            } else {
                console.warn(`[OVERDUE NOTIFICATION] ⚠️ Loại hóa đơn không được hỗ trợ: ${invoiceType}`);
                return null;
            }

            console.log(`[OVERDUE NOTIFICATION] 📝 Title: ${title}`);

            // Tạo notification - type = 'system'
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

            console.log(`[OVERDUE NOTIFICATION] 💾 Lưu notification vào DB...`);
            const savedNotif = await notification.save();
            console.log(`[OVERDUE NOTIFICATION] ✅ THÀNH CÔNG! Thông báo quá hạn đã lưu vào DB`);
            console.log(`[OVERDUE NOTIFICATION] 🆔 Notification ID: ${savedNotif._id}`);

            return savedNotif;

        } catch (error) {
            console.error(`[OVERDUE NOTIFICATION] ❌ LỖI: ${error.message}`);
            console.error(`[OVERDUE NOTIFICATION] 📌 Stack trace:`, error.stack);
            return null;
        }
    }

    // Gửi thông báo quá hạn cho tất cả hóa đơn chưa thanh toán đã quá hạn
    async checkAndSendOverdueNotifications() {
        try {
            console.log(`[OVERDUE CHECK] 🔄 Bắt đầu kiểm tra hóa đơn quá hạn...`);
            const now = new Date();
            let totalSent = 0;

            // Check InvoicePeriodic quá hạn
            console.log(`[OVERDUE CHECK] 📋 Query InvoicePeriodic: status='Unpaid', dueDate < ${now.toISOString()}`);
            const overduePeriodics = await require('../../invoice-management/models/invoice_periodic.model').find({
                status: 'Unpaid',
                dueDate: { $lt: now }
            }).populate('contractId', 'tenantId');
            console.log(`[OVERDUE CHECK] 📊 Tìm thấy ${overduePeriodics.length} hóa đơn định kỳ có status=Unpaid và dueDate quá hạn`);

            for (const invoice of overduePeriodics) {
                if (!invoice.contractId) {
                    console.log(`[OVERDUE CHECK] ⏭️ Invoice ${invoice.invoiceCode} không có contractId, bỏ qua`);
                    continue;
                }
                if (!invoice.contractId.tenantId) {
                    console.log(`[OVERDUE CHECK] ⏭️ Invoice ${invoice.invoiceCode} có contract nhưng không có tenantId, bỏ qua`);
                    continue;
                }
                console.log(`[OVERDUE CHECK] ✅ Xử lý InvoicePeriodic: ${invoice.invoiceCode} | tenantId: ${invoice.contractId.tenantId} | dueDate: ${invoice.dueDate}`);

                // Kiểm tra đã gửi notification trong 7 ngày chưa
                const existingNotif = await Notification.findOne({
                    'recipients.recipient_id': invoice.contractId.tenantId,
                    type: 'system',
                    content: { $regex: invoice.invoiceCode || '', $options: 'i' },
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                });
                if (existingNotif) {
                    console.log(`[OVERDUE CHECK] ⏭️ Invoice ${invoice.invoiceCode} đã có notification trong 7 ngày, bỏ qua`);
                    continue;
                }

                const daysOverdue = Math.floor((now - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
                const result = await this.createOverdueInvoiceNotification(
                    invoice.contractId.tenantId,
                    'periodic',
                    {
                        invoiceCode: invoice.invoiceCode,
                        title: invoice.title,
                        totalAmount: invoice.totalAmount,
                        dueDate: invoice.dueDate,
                        daysOverdue
                    }
                );
                if (result) totalSent++;
            }

            // Check InvoiceIncurred quá hạn
            console.log(`[OVERDUE CHECK] 📋 Query InvoiceIncurred: status='Unpaid', dueDate < ${now.toISOString()}`);
            const overdueIncurreds = await require('../../invoice-management/models/invoice_incurred.model').find({
                status: 'Unpaid',
                dueDate: { $lt: now }
            }).populate('contractId', 'tenantId');
            console.log(`[OVERDUE CHECK] 📊 Tìm thấy ${overdueIncurreds.length} hóa đơn phát sinh có status=Unpaid và dueDate quá hạn`);

            for (const invoice of overdueIncurreds) {
                if (!invoice.contractId) {
                    console.log(`[OVERDUE CHECK] ⏭️ Invoice ${invoice.invoiceCode} không có contractId, bỏ qua`);
                    continue;
                }
                if (!invoice.contractId.tenantId) {
                    console.log(`[OVERDUE CHECK] ⏭️ Invoice ${invoice.invoiceCode} có contract nhưng không có tenantId, bỏ qua`);
                    continue;
                }
                console.log(`[OVERDUE CHECK] ✅ Xử lý InvoiceIncurred: ${invoice.invoiceCode} | tenantId: ${invoice.contractId.tenantId} | dueDate: ${invoice.dueDate}`);

                // Kiểm tra đã gửi notification trong 7 ngày chưa
                const existingNotif = await Notification.findOne({
                    'recipients.recipient_id': invoice.contractId.tenantId,
                    type: 'system',
                    content: { $regex: invoice.invoiceCode || '', $options: 'i' },
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                });
                if (existingNotif) {
                    console.log(`[OVERDUE CHECK] ⏭️ Invoice ${invoice.invoiceCode} đã có notification trong 7 ngày, bỏ qua`);
                    continue;
                }

                const daysOverdue = Math.floor((now - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
                const result = await this.createOverdueInvoiceNotification(
                    invoice.contractId.tenantId,
                    'incurred',
                    {
                        invoiceCode: invoice.invoiceCode,
                        title: invoice.title,
                        totalAmount: invoice.totalAmount,
                        dueDate: invoice.dueDate,
                        type: invoice.type,
                        daysOverdue
                    }
                );
                if (result) totalSent++;
            }

            console.log(`[OVERDUE CHECK] ✅ Hoàn thành! Đã gửi ${totalSent} thông báo quá hạn`);
            return { sent: totalSent };

        } catch (error) {
            console.error(`[OVERDUE CHECK] ❌ LỖI: ${error.message}`);
            console.error(`[OVERDUE CHECK] 📌 Stack trace:`, error.stack);
            return { sent: 0, error: error.message };
        }
    }
}

module.exports = new NotificationService();
