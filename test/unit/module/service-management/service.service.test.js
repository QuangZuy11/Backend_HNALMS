const mongoose = require("mongoose");
const ServiceService = require("../../../../src/modules/service-management/services/service.service");
const Service = require("../../../../src/modules/service-management/models/service.model");
const BookService = require("../../../../src/modules/contract-management/models/bookservice.model");
const Contract = require("../../../../src/modules/contract-management/models/contract.model");
const PriceHistory = require("../../../../src/modules/room-floor-management/models/pricehistory.model");
const Room = require("../../../../src/modules/room-floor-management/models/room.model");
const RoomType = require("../../../../src/modules/room-floor-management/models/roomtype.model");

jest.mock("../../../../src/modules/service-management/models/service.model");
jest.mock("../../../../src/modules/contract-management/models/bookservice.model");
jest.mock("../../../../src/modules/contract-management/models/contract.model");
jest.mock("../../../../src/modules/room-floor-management/models/pricehistory.model");
jest.mock("../../../../src/modules/room-floor-management/models/room.model");
jest.mock("../../../../src/modules/room-floor-management/models/roomtype.model");

// Mock mongoose startSession
mongoose.startSession = jest.fn();

describe("ServiceService Unit Tests", () => {
    let session;
    let mockServiceInstance;

    beforeEach(() => {
        session = {
            startTransaction: jest.fn(),
            commitTransaction: jest.fn(),
            abortTransaction: jest.fn(),
            endSession: jest.fn(),
        };
        mongoose.startSession.mockResolvedValue(session);
        mongoose.Types = { ObjectId: jest.fn(id => id) };

        mockServiceInstance = {
            _id: "s1",
            save: jest.fn(),
        };
        Service.mockImplementation(() => mockServiceInstance);

        jest.clearAllMocks();
    });

    describe("createService", () => {
        test("throws error if currentPrice <= 0 or missing", async () => {
            await expect(ServiceService.createService({ name: "A", currentPrice: -1 }))
                .rejects.toEqual({ status: 400, message: "Giá dịch vụ bắt buộc phải lớn hơn 0!" });

            await expect(ServiceService.createService({ name: "A" }))
                .rejects.toEqual({ status: 400, message: "Giá dịch vụ bắt buộc phải lớn hơn 0!" });
        });

        test("throws error if service name already exists", async () => {
            Service.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(true) });

            await expect(ServiceService.createService({ name: "Dien", currentPrice: 5000 }))
                .rejects.toEqual({ status: 400, message: "Tên dịch vụ đã tồn tại!" });
        });

        test("creates service and saves history when valid input", async () => {
            Service.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });

            const newHistoryMock = { save: jest.fn() };
            PriceHistory.mockImplementation(() => newHistoryMock);

            const result = await ServiceService.createService({ name: "Nuoc", currentPrice: 10000 });

            expect(session.startTransaction).toHaveBeenCalled();
            expect(mockServiceInstance.save).toHaveBeenCalledWith({ session });
            expect(newHistoryMock.save).toHaveBeenCalledWith({ session });
            expect(session.commitTransaction).toHaveBeenCalled();
            expect(session.endSession).toHaveBeenCalled();
            expect(result).toBe(mockServiceInstance);
        });
    });

    describe("getAllServices", () => {
        test("returns services based on query and populates histories", async () => {
            const mockQuery = { type: "Fixed", search: "Dien", isActive: "true" };
            const chainMock = {
                sort: jest.fn().mockReturnThis(),
                populate: jest.fn().mockResolvedValue([{ name: "Dien" }]),
            };
            Service.find.mockReturnValue(chainMock);

            const result = await ServiceService.getAllServices(mockQuery);

            expect(Service.find).toHaveBeenCalledWith({
                type: "Fixed",
                isActive: true,
                name: { $regex: "Dien", $options: "i" }
            });
            expect(chainMock.populate).toHaveBeenCalledWith("histories");
            expect(result).toEqual([{ name: "Dien" }]);
        });
    });

    describe("updateService", () => {
        test("throws error if updating price to invalid value", async () => {
            await expect(ServiceService.updateService("id1", { currentPrice: -5 }))
                .rejects.toEqual({ status: 400, message: "Giá dịch vụ bắt buộc phải lớn hơn 0!" });
        });

        test("throws 404 if service not found", async () => {
            Service.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });

            await expect(ServiceService.updateService("id1", { currentPrice: 5000 }))
                .rejects.toEqual({ status: 404, message: "Không tìm thấy dịch vụ" });
        });

        test("throws error if renaming to duplicate name", async () => {
            Service.findById.mockReturnValue({ session: jest.fn().mockResolvedValue({ name: "A", currentPrice: 1000 }) });
            Service.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(true) }); // Found duplicate

            await expect(ServiceService.updateService("id1", { name: "B", currentPrice: 5000 }))
                .rejects.toEqual({ status: 400, message: "Tên dịch vụ mới đã bị trùng!" });
        });

        test("updates service and creates new history if price changes", async () => {
            const mockServiceDoc = { name: "A", currentPrice: 1000, save: jest.fn() };
            Service.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockServiceDoc) });

            const newHistoryMock = { save: jest.fn() };
            PriceHistory.mockImplementation(() => newHistoryMock);
            PriceHistory.findOneAndUpdate.mockResolvedValue(true);

            const result = await ServiceService.updateService("id1", { currentPrice: 2000 });

            expect(PriceHistory.findOneAndUpdate).toHaveBeenCalledWith(
                { relatedId: "id1", onModel: "Service", endDate: null },
                { endDate: expect.any(Date) },
                { session }
            );
            expect(newHistoryMock.save).toHaveBeenCalled();
            expect(mockServiceDoc.save).toHaveBeenCalledWith({ session });
            expect(result.currentPrice).toBe(2000);
        });
    });

    describe("deleteService", () => {
        test("throws 404 if service not found", async () => {
            Service.findByIdAndDelete.mockResolvedValue(null);

            await expect(ServiceService.deleteService("id1"))
                .rejects.toEqual({ status: 404, message: "Không tìm thấy dịch vụ để xóa" });
        });

        test("deletes service and its history successfully", async () => {
            Service.findByIdAndDelete.mockResolvedValue({ _id: "id1" });
            PriceHistory.deleteMany.mockResolvedValue(true);

            const result = await ServiceService.deleteService("id1");

            expect(Service.findByIdAndDelete).toHaveBeenCalledWith("id1", { session });
            expect(PriceHistory.deleteMany).toHaveBeenCalledWith({ relatedId: "id1", onModel: "Service" }, { session });
            expect(session.commitTransaction).toHaveBeenCalled();
            expect(result).toEqual({ _id: "id1" });
        });
    });

    describe("getBookedServicesByTenant", () => {
        test("returns empty array if no active contract found", async () => {
            Contract.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

            const result = await ServiceService.getBookedServicesByTenant("t1");

            expect(result).toEqual([]);
        });

        test("returns filtered services mapped correctly", async () => {
            const mockContract = { _id: "c1", contractCode: "C01" };
            Contract.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockContract) });

            const mockBookService = {
                services: [
                    { serviceId: "s1", endDate: null, startDate: new Date(), quantity: 2 }
                ]
            };

            BookService.findOne.mockReturnValue({
                populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockBookService) })
            });

            const result = await ServiceService.getBookedServicesByTenant("t1");

            expect(result).toHaveLength(1);
            expect(result[0].serviceId).toBe("s1");
            expect(result[0].quantity).toBe(2);
            expect(result[0].contractId).toBe("c1");
        });
    });

    describe("getAllServicesForTenant", () => {
        test("returns services mapped with isBooked correctly", async () => {
            const mockContract = { _id: "c1" };
            Contract.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockContract) });

            const mockBookService = {
                services: [
                    { serviceId: "s1", endDate: null, quantity: 1 }
                ]
            };
            BookService.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockBookService) });

            const mockServices = [
                { _id: "s1", type: "Extension", name: "A" },
                { _id: "s2", type: "Fixed", name: "B" }
            ];
            Service.find.mockReturnValue({
                sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockServices) })
            });

            const result = await ServiceService.getAllServicesForTenant("t1");

            expect(result).toHaveLength(2);
            expect(result[0].isBooked).toBe(true);
            expect(result[0].canBook).toBe(false); // s1 is booked, can't book again
            expect(result[1].isBooked).toBe(false);
            expect(result[1].canBook).toBe(false); // s2 is Fixed, can't book
        });
    });

    describe("bookServiceForTenant", () => {
        test("throws error if quantity is not integer >= 1", async () => {
            await expect(ServiceService.bookServiceForTenant("t1", "s1", 0))
                .rejects.toEqual({ status: 400, message: "Số lượng người phải là số nguyên dương (>= 1)." });
        });

        test("throws error if service not found or not active or fixed", async () => {
            Service.findById.mockResolvedValue(null);
            await expect(ServiceService.bookServiceForTenant("t1", "s1", 1))
                .rejects.toEqual({ status: 404, message: "Dịch vụ không tồn tại." });

            Service.findById.mockResolvedValue({ isActive: false });
            await expect(ServiceService.bookServiceForTenant("t1", "s1", 1))
                .rejects.toEqual({ status: 400, message: "Dịch vụ này hiện không khả dụng." });

            Service.findById.mockResolvedValue({ isActive: true, type: "Fixed" });
            await expect(ServiceService.bookServiceForTenant("t1", "s1", 1))
                .rejects.toEqual({ status: 400, message: "Dịch vụ cố định (Fixed) không thể đăng ký thêm." });
        });

        test("throws error if exceed max room persons", async () => {
            Service.findById.mockResolvedValue({ _id: "s1", isActive: true, type: "Extension" });
            Contract.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "c1", roomId: "r1" }) });
            Room.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "r1", roomTypeId: "rt1" }) });
            RoomType.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "rt1", personMax: 2 }) });

            await expect(ServiceService.bookServiceForTenant("t1", "s1", 3))
                .rejects.toEqual({
                    status: 400,
                    message: "Số lượng xe đăng ký (3) không được vượt quá số người tối đa của phòng (2 xe)."
                });
        });

        test("books service and updates existing book record if unbooked earlier", async () => {
            Service.findById.mockResolvedValue({ _id: "s1", isActive: true, type: "Extension", name: "Bike" });
            Contract.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "c1", roomId: "r1" }) });
            Room.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "r1", roomTypeId: "rt1" }) });
            RoomType.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "rt1", personMax: 5 }) });

            BookService.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }); // Not currently active
            BookService.updateOne.mockResolvedValue({ matchedCount: 1 }); // Updated successfully

            const result = await ServiceService.bookServiceForTenant("t1", "s1", 1);

            expect(BookService.updateOne).toHaveBeenCalledTimes(1);
            expect(result.contractId).toBe("c1");
            expect(result.name).toBe("Bike");
        });
    });

    describe("cancelBookedServiceForTenant", () => {
        test("throws error if service not found or Fixed type", async () => {
            Service.findById.mockResolvedValue({ isActive: true, type: "Fixed" });
            await expect(ServiceService.cancelBookedServiceForTenant("t1", "s1"))
                .rejects.toEqual({ status: 400, message: "Dịch vụ cố định (Fixed) không thể huỷ đăng ký." });
        });

        test("throws error if no active matched entry", async () => {
            Service.findById.mockResolvedValue({ isActive: true, type: "Extension" });
            Contract.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "c1" }) });

            BookService.updateOne.mockResolvedValue({ matchedCount: 0 });

            await expect(ServiceService.cancelBookedServiceForTenant("t1", "s1"))
                .rejects.toEqual({ status: 404, message: "Bạn chưa đăng ký dịch vụ này." });
        });

        test("cancels booking successfully", async () => {
            Service.findById.mockResolvedValue({ isActive: true, type: "Extension" });
            Contract.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "c1" }) });

            BookService.updateOne.mockResolvedValue({ matchedCount: 1 });

            const result = await ServiceService.cancelBookedServiceForTenant("t1", "s1");

            expect(BookService.updateOne).toHaveBeenCalled();
            expect(result.message).toBe("Huỷ đăng ký dịch vụ thành công.");
        });
    });
});
