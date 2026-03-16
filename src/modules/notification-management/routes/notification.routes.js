const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const { authenticate } = require("../../authentication/middlewares");
const {
    validateNotificationContent,
    validatePagination,
    validateObjectId
} = require("../validators/notification.validator");

// Routes yêu cầu xác thực
// [Owner] Tạo thông báo nháp
router.post("/draft",
    authenticate,
    validateNotificationContent,
    notificationController.createDraftNotification
);

// [Owner] Sửa thông báo nháp
router.put("/draft/:notificationId",
    authenticate,
    validateObjectId('notificationId'),
    validateNotificationContent,
    notificationController.updateDraftNotification
);

// [Owner] Xóa thông báo nháp
router.delete("/draft/:notificationId",
    authenticate,
    validateObjectId('notificationId'),
    notificationController.deleteDraftNotification
);

// [Owner] Phát hành thông báo (chuyển từ draft sang sent)
router.post("/draft/:notificationId/publish",
    authenticate,
    validateObjectId('notificationId'),
    notificationController.publishNotification
);

// [Owner] Lấy danh sách thông báo nháp
router.get("/my-drafts",
    authenticate,
    validatePagination,
    notificationController.getMyDraftNotifications
);

// Lấy danh sách thông báo theo role
router.get("/my-notifications",
    authenticate,
    validatePagination,
    notificationController.getMyNotifications
);

// [Manager/Accountant] Đánh dấu thông báo đã đọc
router.patch("/:notificationId/read",
    authenticate,
    validateObjectId('notificationId'),
    notificationController.markAsRead
);

// [Manager/Accountant] Đánh dấu tất cả thông báo đã đọc
router.patch("/mark-all-read",
    authenticate,
    notificationController.markAllAsRead
);

// [Manager/Accountant] Lấy số lượng thông báo chưa đọc
router.get("/unread-count",
    authenticate,
    notificationController.getUnreadCount
);

module.exports = router;
