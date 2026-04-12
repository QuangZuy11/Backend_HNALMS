const mongoose = require("mongoose");
const ContractController = require("../../../../src/modules/contract-management/controllers/contract.controller");
const Contract = require("../../../../src/modules/contract-management/models/contract.model");
const Room = require("../../../../src/modules/room-floor-management/models/room.model");
const User = require("../../../../src/modules/authentication/models/user.model");
const UserInfo = require("../../../../src/modules/authentication/models/userInfor.model");
const Deposit = require("../../../../src/modules/contract-management/models/deposit.model");
const BookService = require("../../../../src/modules/contract-management/models/bookservice.model");

// Mocking models and services
jest.mock("../../../../src/modules/contract-management/models/contract.model");
jest.mock("../../../../src/modules/room-floor-management/models/room.model");
jest.mock("../../../../src/modules/authentication/models/user.model");
jest.mock("../../../../src/modules/authentication/models/userInfor.model");
jest.mock("../../../../src/modules/contract-management/models/deposit.model");
jest.mock("../../../../src/modules/contract-management/models/bookservice.model");
jest.mock("../../../../src/modules/notification-management/services/email.service", () => ({
    sendEmail: jest.fn()
}));
jest.mock("../../../../src/modules/contract-management/services/declinedRenewalSuccessor.service", () => ({
    hasBookedSuccessorAfterDeclinedLease: jest.fn()
}));

jest.spyOn(console, 'error').mockImplementation(() => { });
jest.spyOn(console, 'log').mockImplementation(() => { });

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

describe("ContractController Unit Tests", () => {
    let req, res;

    beforeEach(() => {
        const mock = createMockReqRes();
        req = mock.req;
        res = mock.res;
        jest.clearAllMocks();
    });

    describe("getAllContracts", () => {
        test("returns 200 and list of contracts successfully", async () => {
            req.query = { status: "Active" };

            const mockPopulate1 = jest.fn().mockReturnThis();
            const mockPopulate2 = jest.fn().mockReturnThis();
            const mockSort = jest.fn().mockResolvedValue([{ contractCode: "HN/R1/2026", status: "active" }]);

            // Mock Mongoose chain calls
            Contract.find.mockReturnValue({
                populate: mockPopulate1.mockImplementation(() => ({
                    populate: mockPopulate2.mockImplementation(() => ({
                        sort: mockSort
                    }))
                }))
            });

            await ContractController.getAllContracts(req, res);

            expect(Contract.find).toHaveBeenCalledWith({ status: "active" });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                count: 1,
                data: [{ contractCode: "HN/R1/2026", status: "active" }]
            });
        });

        test("handles server error properly", async () => {
            Contract.find.mockImplementation(() => { throw new Error("Database error"); });

            await ContractController.getAllContracts(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ success: false, message: "Server Error" });
        });
    });

    describe("getMyContracts", () => {
        test("returns 401 if tenantId is missing from req.user", async () => {
            req.user = {};

            await ContractController.getMyContracts(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Unauthorized - Không tìm thấy thông tin người dùng"
            });
        });

        test("returns 200 and formatted contracts list", async () => {
            req.user = { userId: "tenant123" };

            // Mock Contracts
            const mockContracts = [{
                _id: "c1",
                roomId: { roomTypeId: { currentPrice: mongoose.Types.Decimal128.fromString("50000") } }
            }];
            const mockContractChain = {
                populate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(mockContracts)
            };
            Contract.find.mockReturnValue(mockContractChain);

            // Mock BookServices
            const mockBookServicesChain = {
                populate: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue([])
            };
            BookService.find.mockReturnValue(mockBookServicesChain);

            await ContractController.getMyContracts(req, res);

            expect(Contract.find).toHaveBeenCalledWith({ tenantId: "tenant123" });
            expect(BookService.find).toHaveBeenCalledWith({ contractId: { $in: ["c1"] } });

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                count: 1
            }));
        });
    });

    // We can continue mocking 'createContract' and 'getContractById' similarly
});
