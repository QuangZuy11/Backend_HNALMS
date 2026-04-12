const MeterReadingController = require("../../../../src/modules/invoice-management/controllers/meterreading.controller");
const meterReadingService = require("../../../../src/modules/invoice-management/services/meterreading.service");

jest.mock("../../../../src/modules/invoice-management/services/meterreading.service");

const createMockReqRes = () => {
    const req = { body: {}, params: {}, query: {}, user: {} };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    };
    return { req, res };
};

describe("MeterReadingController Unit Tests (Controller API logic)", () => {
    let req, res;

    beforeEach(() => {
        const mock = createMockReqRes();
        req = mock.req;
        res = mock.res;
        jest.clearAllMocks();
    });

    describe("enterReading", () => {
        test("Return 201 (Confirm T) when NewIndex > OldIndex (Service returns data)", async () => {
            req.body = { oldIndex: 100, newIndex: 150 };
            const mockResult = { _id: "reading1", usageAmount: 50 };

            meterReadingService.enterReading.mockResolvedValue(mockResult);

            await MeterReadingController.enterReading(req, res);

            // Tương ứng với case Confirm T trong Data table 
            // ("Đã lưu thành công chỉ số" có thể do Frontend tự map dựa vào success: true)
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: mockResult
            }));
        });

        test("Return 400 with 'Chỉ số mới phải lớn hơn chỉ số cũ' when NewIndex < OldIndex", async () => {
            req.body = { oldIndex: 100, newIndex: 50 };

            // Giả lập Service throw lỗi ném ra message như trong testcase (hoặc tương tự)
            meterReadingService.enterReading.mockRejectedValue(new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ (Trừ khi đồng hồ quay vòng)"));

            await MeterReadingController.enterReading(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: expect.stringMatching(/Chỉ số mới không được nhỏ hơn chỉ số cũ/)
            }));
        });
    });
});
