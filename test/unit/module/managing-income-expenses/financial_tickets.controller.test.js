const FinancialTicketController = require("../../../../src/modules/managing-income-expenses/controllers/financial_tickets.controller");
const FinancialTicket = require("../../../../src/modules/managing-income-expenses/models/financial_tickets");

// Mock Models
jest.mock("../../../../src/modules/managing-income-expenses/models/financial_tickets");
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

describe("FinancialTicketController Unit Tests", () => {
    let req, res;

    beforeEach(() => {
        const mock = createMockReqRes();
        req = mock.req;
        res = mock.res;
        jest.clearAllMocks();
    });

    describe("createManualPaymentTicket", () => {
        // Case 1: Normal - Success
        test("Case 1: Should create a manual payment ticket successfully", async () => {
            req.body = { title: "Bảo trì thang máy", amount: 5000000 };
            
            // Mock getNextManualPaymentVoucher logic
            FinancialTicket.findOne.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(null)
            });
            FinancialTicket.exists.mockResolvedValue(false);
            
            const savedTicket = { _id: "ticket123", ...req.body, paymentVoucher: "PAY-15042026-0001", status: "Pending" };
            FinancialTicket.create.mockResolvedValue(savedTicket);

            await FinancialTicketController.createManualPaymentTicket(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: savedTicket,
                message: "Tạo phiếu chi thành công"
            });
        });

        // Case 2 & 3: Abnormal - Title Validation
        test("Case 2: Should return 400 if title is missing", async () => {
            req.body = { amount: 100000 };
            await FinancialTicketController.createManualPaymentTicket(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Vui lòng nhập tiêu đề"
            });
        });

        test("Case 3: Should return 400 if title is whitespace only", async () => {
            req.body = { title: "   ", amount: 100000 };
            await FinancialTicketController.createManualPaymentTicket(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Vui lòng nhập tiêu đề" }));
        });

        // Case 4 & 5: Abnormal - Amount Validation
        test("Case 4: Should return 400 if amount is not a number", async () => {
            req.body = { title: "Sửa chữa", amount: "not-a-number" };
            await FinancialTicketController.createManualPaymentTicket(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ 
                message: expect.stringMatching(/Số tiền không hợp lệ/) 
            }));
        });

        test("Case 5: Should return 400 if amount is less than 1,000", async () => {
            req.body = { title: "Sửa chữa", amount: 999 };
            await FinancialTicketController.createManualPaymentTicket(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ 
                message: expect.stringMatching(/Số tiền không hợp lệ/) 
            }));
        });

        // Case 6: Abnormal - Voucher limit exceeded
        test("Case 6: Should return 500 if voucher limit (9999) is reached", async () => {
            req.body = { title: "Bảo trì", amount: 200000 };

            // Mock to look like we're at 9999
            const prefix = `PAY-${String(new Date().getDate()).padStart(2, '0')}${String(new Date().getMonth() + 1).padStart(2, '0')}${new Date().getFullYear()}-`;
            FinancialTicket.findOne.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue({ paymentVoucher: `${prefix}9999` })
            });

            await FinancialTicketController.createManualPaymentTicket(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Đã vượt quá giới hạn mã phiếu chi trong ngày (9999)"
            });
        });

        // Case 7: Boundary - Amount exactly 1000
        test("Case 7: Should create ticket when amount is exactly 1,000", async () => {
            req.body = { title: "Phí dịch vụ", amount: 1000 };
            
            FinancialTicket.findOne.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(null)
            });
            FinancialTicket.exists.mockResolvedValue(false);
            FinancialTicket.create.mockResolvedValue({ _id: "t123", ...req.body });

            await FinancialTicketController.createManualPaymentTicket(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        // Case 8: Exception - Database error during create
        test("Case 8: Should return 500 if database creation fails", async () => {
            req.body = { title: "Sửa ống nước", amount: 300000 };

            FinancialTicket.findOne.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(null)
            });
            FinancialTicket.exists.mockResolvedValue(false);
            FinancialTicket.create.mockRejectedValue(new Error("DB Error"));

            await FinancialTicketController.createManualPaymentTicket(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "DB Error"
            });
        });

        // Case 10: Internal - Collision handling
        test("Case 10: Should increment number if voucher code collision occurs", async () => {
            req.body = { title: "Test", amount: 10000 };
            
            FinancialTicket.findOne.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue({ paymentVoucher: "PAY-15042026-0001" })
            });

            // Mock collision on 0002, success on 0003
            FinancialTicket.exists
                .mockResolvedValueOnce(true) // 0002 exists
                .mockResolvedValueOnce(false); // 0003 clear

            FinancialTicket.create.mockResolvedValue({ _id: "t123" });

            await FinancialTicketController.createManualPaymentTicket(req, res);

            // 0001 was latest, so it tries 0002 (exists), then 0003 (ok)
            expect(FinancialTicket.create).toHaveBeenCalledWith(expect.objectContaining({
                paymentVoucher: expect.stringMatching(/0003$/)
            }));
        });

        // Case 11: Internal - 100 collisions limit
        test("Case 11: Should throw error if 100 consecutive voucher collisions occur", async () => {
            req.body = { title: "Fail", amount: 10000 };
            
            FinancialTicket.findOne.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue({ paymentVoucher: "PAY-15042026-0001" })
            });

            // Always exists
            FinancialTicket.exists.mockResolvedValue(true);

            await FinancialTicketController.createManualPaymentTicket(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "Không thể tạo mã phiếu chi mới, vui lòng thử lại"
            }));
        });
    });

    describe("getNextPaymentVoucherCode", () => {
        test("Case 9: Should return 200 and a new voucher code", async () => {
            FinancialTicket.findOne.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(null)
            });
            FinancialTicket.exists.mockResolvedValue(false);

            await FinancialTicketController.getNextPaymentVoucherCode(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({ paymentVoucher: expect.stringMatching(/^PAY-/) })
            }));
        });

        test("Case 12: Should return 500 if error occurs in getNextPaymentVoucherCode", async () => {
            FinancialTicket.findOne.mockImplementation(() => { throw new Error("Voucher Error"); });

            await FinancialTicketController.getNextPaymentVoucherCode(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "Voucher Error"
            });
        });
    });
});
