const ServiceController = require("../../../../src/modules/service-management/controllers/service.controller");
const ServiceService = require("../../../../src/modules/service-management/services/service.service");

// Mock Service
jest.mock("../../../../src/modules/service-management/services/service.service");
jest.spyOn(console, 'error').mockImplementation(() => { });

const createMockReqRes = () => {
    const req = {
        body: {},
        params: {},
        query: {},
        user: {}
    };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    };
    return { req, res };
};

describe("ServiceController Unit Tests", () => {
    let req, res;

    beforeEach(() => {
        const mock = createMockReqRes();
        req = mock.req;
        res = mock.res;
        jest.clearAllMocks();
    });

    describe("getServices", () => {
        test("returns 200 and list of services", async () => {
            const mockServices = [{ name: "Service 1" }];
            ServiceService.getAllServices.mockResolvedValue(mockServices);

            await ServiceController.getServices(req, res);

            expect(ServiceService.getAllServices).toHaveBeenCalledWith(req.query);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                count: 1,
                data: mockServices
            });
        });

        test("handles error properly", async () => {
            ServiceService.getAllServices.mockRejectedValue({ status: 400, message: "Custom error" });

            await ServiceController.getServices(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: "Custom error" });
        });
    });

    describe("createService", () => {
        test("returns 201 and created service data", async () => {
            const mockService = { name: "New Service", _id: "123" };
            req.body = { name: "New Service" };
            ServiceService.createService.mockResolvedValue(mockService);

            await ServiceController.createService(req, res);

            expect(ServiceService.createService).toHaveBeenCalledWith(req.body);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Tạo dịch vụ thành công",
                data: mockService
            });
        });

        test("handles error properly", async () => {
            ServiceService.createService.mockRejectedValue(new Error("Global error"));

            await ServiceController.createService(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: "Global error" });
        });
    });

    describe("updateService", () => {
        test("returns 200 and updated service data", async () => {
            const mockService = { name: "Updated Service" };
            req.params.id = "123";
            req.body = { name: "Updated Service" };
            ServiceService.updateService.mockResolvedValue(mockService);

            await ServiceController.updateService(req, res);

            expect(ServiceService.updateService).toHaveBeenCalledWith("123", req.body);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Cập nhật dịch vụ thành công",
                data: mockService
            });
        });

        test("handles error properly", async () => {
            ServiceService.updateService.mockRejectedValue({ status: 404, message: "Không tìm thấy" });
            await ServiceController.updateService(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: "Không tìm thấy" });
        });
    });

    describe("deleteService", () => {
        test("returns 200 when deleting service successfully", async () => {
            req.params.id = "123";
            ServiceService.deleteService.mockResolvedValue(true);

            await ServiceController.deleteService(req, res);

            expect(ServiceService.deleteService).toHaveBeenCalledWith("123");
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ success: true, message: "Đã xóa dịch vụ" });
        });

        test("handles error when deleting service", async () => {
            req.params.id = "123";
            ServiceService.deleteService.mockRejectedValue({ status: 400, message: "Cannot delete" });

            await ServiceController.deleteService(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: "Cannot delete" });
        });
    });

    describe("getMyBookedServices", () => {
        test("returns 401 if tenantId is not in req.user", async () => {
            req.user = {};
            await ServiceController.getMyBookedServices(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: "Không tìm thấy thông tin người dùng" });
        });

        test("returns 200 and booked services list from tenantId and contractId query", async () => {
            req.user = { userId: "tenant1" };
            req.query = { contractId: "contract1" };
            const mockResult = [{ serviceId: "s1" }];
            ServiceService.getBookedServicesByTenant.mockResolvedValue(mockResult);

            await ServiceController.getMyBookedServices(req, res);

            expect(ServiceService.getBookedServicesByTenant).toHaveBeenCalledWith("tenant1", "contract1");
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                count: 1,
                data: mockResult
            });
        });
    });

    describe("getBookedServicesByTenant", () => {
        test("returns 200 and data when valid tenantId param", async () => {
            req.params = { tenantId: "tenant123" };
            const mockResult = [{ serviceId: "s1" }];
            ServiceService.getBookedServicesByTenant.mockResolvedValue(mockResult);

            await ServiceController.getBookedServicesByTenant(req, res);

            expect(ServiceService.getBookedServicesByTenant).toHaveBeenCalledWith("tenant123");
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                count: 1,
                data: mockResult
            });
        });
    });

    describe("getAllServicesForTenant", () => {
        test("returns 401 if userId missing", async () => {
            req.user = {};
            await ServiceController.getAllServicesForTenant(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        test("returns 200 and services info", async () => {
            req.user = { userId: "tenant_abc" };
            req.query = { contractId: "contract_xyz" };
            const mockResult = [{ name: "Dich vu dien" }];
            ServiceService.getAllServicesForTenant.mockResolvedValue(mockResult);

            await ServiceController.getAllServicesForTenant(req, res);

            expect(ServiceService.getAllServicesForTenant).toHaveBeenCalledWith("tenant_abc", "contract_xyz");
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                count: 1,
                data: mockResult
            });
        });
    });

    describe("bookService", () => {
        test("returns 401 if userId missing", async () => {
            req.user = {};
            await ServiceController.bookService(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        test("returns 400 if serviceId is missing", async () => {
            req.user = { userId: "t1" };
            req.body = { quantity: 2 };
            await ServiceController.bookService(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: "serviceId là bắt buộc" });
        });

        test("returns 400 if quantity is invalid", async () => {
            req.user = { userId: "t1" };
            req.body = { serviceId: "s1", quantity: "abc" };
            await ServiceController.bookService(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: "Số lượng người (quantity) phải là số nguyên >= 1" });
        });

        test("returns 201 when book successfully", async () => {
            req.user = { userId: "t1" };
            req.body = { serviceId: "s1", quantity: 3, contractId: "c1" };
            const mockData = { serviceId: "s1", quantity: 3 };
            ServiceService.bookServiceForTenant.mockResolvedValue(mockData);

            await ServiceController.bookService(req, res);

            expect(ServiceService.bookServiceForTenant).toHaveBeenCalledWith("t1", "s1", 3, "c1");
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Đăng ký dịch vụ thành công",
                data: mockData
            });
        });
    });

    describe("cancelBookedService", () => {
        test("returns 401 if userId missing", async () => {
            req.user = {};
            await ServiceController.cancelBookedService(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        test("returns 200 when cancelling service successfully", async () => {
            req.user = { userId: "t1" };
            req.params = { serviceId: "s1" };
            req.query = { contractId: "c1" };
            ServiceService.cancelBookedServiceForTenant.mockResolvedValue({ message: "Huỷ đăng ký dịch vụ thành công." });

            await ServiceController.cancelBookedService(req, res);

            expect(ServiceService.cancelBookedServiceForTenant).toHaveBeenCalledWith("t1", "s1", "c1");
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Huỷ đăng ký dịch vụ thành công."
            });
        });

        test("handles inner throw correctly", async () => {
            req.user = { userId: "t1" };
            req.params = { serviceId: "s1" };
            ServiceService.cancelBookedServiceForTenant.mockRejectedValue({ status: 404, message: "Dịch vụ không tồn tại" });

            await ServiceController.cancelBookedService(req, res);

            expect(ServiceService.cancelBookedServiceForTenant).toHaveBeenCalledWith("t1", "s1", null);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: "Dịch vụ không tồn tại" });
        });
    });
});
