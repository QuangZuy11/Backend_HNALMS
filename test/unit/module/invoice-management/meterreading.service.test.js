const MeterReadingService = require("../../../../src/modules/invoice-management/services/meterreading.service");
const MeterReading = require("../../../../src/modules/invoice-management/models/meterreading.model");
const Service = require("../../../../src/modules/service-management/models/service.model");
const Contract = require("../../../../src/modules/contract-management/models/contract.model");
const InvoicePeriodic = require("../../../../src/modules/invoice-management/models/invoice_periodic.model");

jest.mock("../../../../src/modules/invoice-management/models/meterreading.model");
jest.mock("../../../../src/modules/service-management/models/service.model");
jest.mock("../../../../src/modules/contract-management/models/contract.model");
jest.mock("../../../../src/modules/invoice-management/models/invoice_periodic.model");

describe("MeterReadingService Unit Tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("enterReading (Coverage for NewIndex logic)", () => {
        const baseData = {
            roomId: "room123",
            utilityId: "util123",
            oldIndex: 100,
        };

        const mockServiceInfo = {
            _id: "util123",
            name: "Điện",
            currentPrice: 3000
        };

        test("Case 1: NewIndex > OldIndex -> Saves successfully", async () => {
            const data = { ...baseData, newIndex: 150 };

            Service.findById.mockResolvedValue(mockServiceInfo);
            Contract.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });

            const newReadingMock = { save: jest.fn() };
            MeterReading.mockImplementation(() => newReadingMock);

            const result = await MeterReadingService.enterReading(data);

            expect(MeterReading).toHaveBeenCalledWith(expect.objectContaining({
                usageAmount: 50 // 150 - 100
            }));
            expect(newReadingMock.save).toHaveBeenCalled();
        });

        test("Case 2: NewIndex < OldIndex (New Round) -> Saves successfully when isReset=true", async () => {
            const data = { ...baseData, oldIndex: 99900, newIndex: 50, isReset: true, maxIndex: 100000 };

            Service.findById.mockResolvedValue(mockServiceInfo);
            Contract.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });

            const newReadingMock = { save: jest.fn() };
            MeterReading.mockImplementation(() => newReadingMock);

            await MeterReadingService.enterReading(data);

            expect(MeterReading).toHaveBeenCalledWith(expect.objectContaining({
                usageAmount: 150 // 100000 - 99900 + 50
            }));
            expect(newReadingMock.save).toHaveBeenCalled();
        });

        test("Case 3: NewIndex < OldIndex -> Throws Error", async () => {
            const data = { ...baseData, oldIndex: 100, newIndex: 50, isReset: false };

            await expect(MeterReadingService.enterReading(data)).rejects.toThrow(/Chỉ số mới không được nhỏ hơn chỉ số cũ/);
        });
    });
});
