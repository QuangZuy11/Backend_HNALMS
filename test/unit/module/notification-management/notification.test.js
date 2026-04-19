/**
 * notification.test.js - UNIT TEST "ĐÚNG NGHĨA" CHO CHỨC NĂNG NOTIFICATION
 *
 * - Test middleware `validateTitle`, `validateContent` như 1 hàm thuần.
 * - Test service `createDraftNotification`, `updateDraftNotification` với mock model
 *   (không gọi HTTP, không kết nối DB thật).
 */

// ────────────────────────────────────────────────────────────────────────────────
// 1. UNIT TEST CHO VALIDATORS (middleware)
// ────────────────────────────────────────────────────────────────────────────────

const { validateTitle, validateContent } = require("../../../../src/modules/notification-management/validators/notification.validator");

describe("Notification Validator Unit Tests", () => {
    describe("validateTitle", () => {
        test("Return valid:false if title is empty", () => {
            const result = validateTitle("");
            expect(result.valid).toBe(false);
            expect(result.message).toMatch(/Tiêu đề thông báo không được để trống/);
        });

        test("Return valid:false if title exceeds 200 chars", () => {
            const result = validateTitle("A".repeat(201));
            expect(result.valid).toBe(false);
            expect(result.message).toMatch(/không được vượt quá 200 ký tự/);
        });

        test("Return valid:true for valid title", () => {
            const result = validateTitle("Thông báo mới");
            expect(result.valid).toBe(true);
        });
    });

    describe("validateContent", () => {
        test("Return valid:false if content is empty", () => {
            const result = validateContent("");
            expect(result.valid).toBe(false);
            expect(result.message).toMatch(/Nội dung thông báo không được để trống/);
        });

        test("Return valid:false if content exceeds 1000 chars", () => {
            const result = validateContent("A".repeat(1001));
            expect(result.valid).toBe(false);
            expect(result.message).toMatch(/không được vượt quá 1000 ký tự/);
        });

        test("Return valid:true for valid content", () => {
            const result = validateContent("Đây là nội dung hợp lệ");
            expect(result.valid).toBe(true);
        });
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// 2. UNIT TEST CHO NOTIFICATION SERVICE
// ────────────────────────────────────────────────────────────────────────────────

jest.mock("../../../../src/modules/notification-management/models/notification.model");
jest.mock("../../../../src/modules/authentication/models/user.model");

const Notification = require("../../../../src/modules/notification-management/models/notification.model");
const NotificationService = require("../../../../src/modules/notification-management/services/notification.service");

describe("NotificationService Unit Tests", () => {
    let notificationService;

    beforeEach(() => {
        notificationService = new NotificationService();
        jest.clearAllMocks();
    });

    describe("createDraftNotification", () => {
        test("creates draft notification with owner role (type should be staff)", async () => {
            const mockNotification = {
                _id: "notif-id-1",
                title: "Thông báo mới",
                content: "Nội dung thông báo",
                type: "staff",
                status: "draft",
                created_by: "user-id-1",
                recipients: [],
                save: jest.fn().mockResolvedValue(true),
            };

            Notification.mockImplementation(() => mockNotification);

            const result = await notificationService.createDraftNotification(
                "user-id-1",
                "owner",
                "Thông báo mới",
                "Nội dung thông báo"
            );

            expect(result.type).toBe("staff");
            expect(result.status).toBe("draft");
            expect(result.title).toBe("Thông báo mới");
        });

        test("creates draft notification with tenant role (type should be tenant)", async () => {
            const mockNotification = {
                _id: "notif-id-2",
                title: "Thông báo cho tenant",
                content: "Nội dung",
                type: "tenant",
                status: "draft",
                created_by: "user-id-2",
                recipients: [],
                save: jest.fn().mockResolvedValue(true),
            };

            Notification.mockImplementation(() => mockNotification);

            const result = await notificationService.createDraftNotification(
                "user-id-2",
                "tenant",
                "Thông báo cho tenant",
                "Nội dung"
            );

            expect(result.type).toBe("tenant");
            expect(result.status).toBe("draft");
        });

        test("throws error when save fails", async () => {
            const mockNotification = {
                save: jest.fn().mockRejectedValue(new Error("Database error")),
            };

            Notification.mockImplementation(() => mockNotification);

            await expect(
                notificationService.createDraftNotification(
                    "user-id",
                    "owner",
                    "Title",
                    "Content"
                )
            ).rejects.toThrow("Lỗi tạo thông báo nháp");
        });
    });

    describe("updateDraftNotification", () => {
        test("updates draft notification successfully", async () => {
            const mockNotification = {
                _id: "notif-id-1",
                title: "Old title",
                content: "Old content",
                created_by: "user-id-1",
                status: "draft",
                save: jest.fn().mockResolvedValue(true),
            };

            Notification.findOne.mockResolvedValue(mockNotification);

            const result = await notificationService.updateDraftNotification(
                "notif-id-1",
                "user-id-1",
                "New title",
                "New content"
            );

            expect(result.title).toBe("New title");
            expect(result.content).toBe("New content");
            expect(mockNotification.save).toHaveBeenCalled();
        });

        test("throws error when notification not found", async () => {
            Notification.findOne.mockResolvedValue(null);

            await expect(
                notificationService.updateDraftNotification(
                    "notif-id-not-exist",
                    "user-id-1",
                    "Title",
                    "Content"
                )
            ).rejects.toThrow("Không tìm thấy thông báo nháp");
        });

        test("throws error when user is not the creator", async () => {
            Notification.findOne.mockResolvedValue(null); // Simulates not finding the notification created by this user

            await expect(
                notificationService.updateDraftNotification(
                    "notif-id-1",
                    "wrong-user-id",
                    "Title",
                    "Content"
                )
            ).rejects.toThrow("Không tìm thấy thông báo nháp");
        });
    });
});
