const NotificationController = require("../../../../src/modules/notification-management/controllers/notification.controller");
const notificationService = require("../../../../src/modules/notification-management/services/notification.service");

jest.mock("../../../../src/modules/notification-management/services/notification.service");

const createMockReqRes = () => {
    const req = { body: {}, params: {}, query: {}, user: {} };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    };
    return { req, res };
};

describe("NotificationController Unit Tests", () => {
    let req, res;

    beforeEach(() => {
        const mock = createMockReqRes();
        req = mock.req;
        res = mock.res;
        jest.clearAllMocks();
    });

    describe("createDraftNotification", () => {
        test("Return 403 when User is Tenant (RBAC verification)", async () => {
            req.user = { userId: "user1", role: "tenant" };
            req.body = { title: "Title", content: "Content" };

            await NotificationController.createDraftNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Chỉ Owner hoặc Manager mới có quyền tạo thông báo"
            });
        });

        test("Return 201 when User is Manager and creation successful", async () => {
            req.user = { userId: "manager1", role: "manager" };
            req.body = { title: "Valid Title", content: "Valid Content" };

            const mockNotification = { _id: "notif1", title: "Valid Title", status: "draft" };
            notificationService.createDraftNotification.mockResolvedValue(mockNotification);

            await NotificationController.createDraftNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Tạo thông báo nháp thành công",
                data: mockNotification
            });
            expect(notificationService.createDraftNotification).toHaveBeenCalledWith("manager1", "manager", "Valid Title", "Valid Content");
        });

        test("Return 500 when Service throws error", async () => {
            req.user = { userId: "owner1", role: "owner" };
            req.body = { title: "Title", content: "Content" };

            notificationService.createDraftNotification.mockRejectedValue(new Error("Lỗi DB"));

            await NotificationController.createDraftNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Lỗi DB"
            });
        });
    });

    describe("updateDraftNotification", () => {
        test("Return 403 when User is Tenant (RBAC verification)", async () => {
            req.user = { userId: "user1", role: "tenant" };
            req.params = { notificationId: "notif1" };
            req.body = { title: "Title Updated", content: "Content Updated" };

            await NotificationController.updateDraftNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Chỉ Owner hoặc Manager mới có quyền sửa thông báo"
            });
        });

        test("Return 200 when Update successful", async () => {
            req.user = { userId: "manager1", role: "manager" };
            req.params = { notificationId: "notif1" };
            req.body = { title: "Valid Title", content: "Valid Content" };

            const mockNotification = { _id: "notif1", title: "Valid Title", content: "Valid Content", status: "draft" };
            notificationService.updateDraftNotification.mockResolvedValue(mockNotification);

            await NotificationController.updateDraftNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Cập nhật thông báo nháp thành công",
                data: mockNotification
            });
            expect(notificationService.updateDraftNotification).toHaveBeenCalledWith("notif1", "manager1", "Valid Title", "Valid Content");
        });

        test("Return 500 when Notification not found or unauthorized owner", async () => {
            req.user = { userId: "owner1", role: "owner" };
            req.params = { notificationId: "unknown" };
            req.body = { title: "Title", content: "Content" };

            notificationService.updateDraftNotification.mockRejectedValue(new Error("Không tìm thấy thông báo nháp hoặc bạn không có quyền chỉnh sửa"));

            await NotificationController.updateDraftNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Không tìm thấy thông báo nháp hoặc bạn không có quyền chỉnh sửa"
            });
        });
    });

    describe("publishNotification", () => {
        test("Return 403 when User is not Owner/Manager", async () => {
            req.user = { userId: "u1", role: "tenant" };
            req.params = { notificationId: "n1" };

            await NotificationController.publishNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: expect.stringMatching(/Chỉ Owner hoặc Manager mới có quyền/)
            }));
        });

        test("Return 200 when Publish successful", async () => {
            req.user = { userId: "m1", role: "manager" };
            req.params = { notificationId: "n1" };
            const mockData = { _id: "n1", status: "sent" };

            notificationService.publishNotification.mockResolvedValue(mockData);

            await NotificationController.publishNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Phát hành thông báo thành công",
                data: mockData
            });
        });
    });
});
