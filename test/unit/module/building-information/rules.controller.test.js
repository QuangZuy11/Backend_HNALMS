const rulesController = require("../../../../src/modules/building-information/controllers/rules.controller");
const buildingService = require("../../../../src/modules/building-information/services/building.service");

// Mock Service
jest.mock("../../../../src/modules/building-information/services/building.service");
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

describe("RulesController Unit Tests", () => {
    let req, res;

    beforeEach(() => {
        const mock = createMockReqRes();
        req = mock.req;
        res = mock.res;
        jest.clearAllMocks();
    });

    describe("getActiveRules", () => {
        test("returns 200 and active rules", async () => {
            const mockRules = { status: "active", categories: [] };
            buildingService.getActiveRules.mockResolvedValue(mockRules);

            await rulesController.getActiveRules(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Building rules retrieved successfully",
                data: mockRules
            });
        });

        test("returns 404 if no rules found", async () => {
            buildingService.getActiveRules.mockResolvedValue(null);

            await rulesController.getActiveRules(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: { status: 404, message: "No active building rules found" }
            });
        });
    });

    describe("createRules (Test Cases from User Table)", () => {
        // Case 8: Normal - Valid categories and valid guidelines
        test("Case 8: Returns 201 when valid categories and valid guidelines", async () => {
            req.body = {
                categories: [{ title: "Chung", icon: "Home", rules: ["Cấm ồn"] }],
                guidelines: [{ title: "Rác", content: "Đổ đúng giờ" }]
            };
            const mockResult = { _id: "rule123", ...req.body };
            buildingService.createRules.mockResolvedValue(mockResult);

            await rulesController.createRules(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Nội quy được tạo thành công",
                data: mockResult
            });
        });

        // Case 1: Boundary - Empty categories ([]) but valid guideline
        test("Case 1: Returns 201 when categories is empty but guideline is valid", async () => {
            req.body = {
                categories: [],
                guidelines: [{ title: "Rác", content: "Đổ đúng giờ" }]
            };
            buildingService.createRules.mockResolvedValue(req.body);

            await rulesController.createRules(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                message: "Nội quy được tạo thành công"
            }));
        });

        // Case 2 & 3: Abnormal - Missing category title or icon
        test("Case 2: Returns 400 'icon is required là bắt buộc' when category title is empty", async () => {
            req.body = {
                categories: [{ title: "", icon: "Home" }]
            };
            await rulesController.createRules(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: { status: 400, message: "icon is required là bắt buộc" }
            });
        });

        test("Case 3: Returns 400 'icon is required là bắt buộc' when category icon is missing", async () => {
            req.body = {
                categories: [{ title: "Chung" }]
            };
            await rulesController.createRules(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.objectContaining({ message: "icon is required là bắt buộc" })
            }));
        });

        // Case 4: Boundary - Category valid, rules empty ([])
        test("Case 4: Returns 201 when categories valid but rules array is empty", async () => {
            req.body = {
                categories: [{ title: "Chung", icon: "Home", rules: [] }]
            };
            buildingService.createRules.mockResolvedValue(req.body);

            await rulesController.createRules(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                message: "Nội quy được tạo thành công"
            }));
        });

        // Case 6 & 7: Abnormal - Missing guideline title or content
        test("Case 6: Returns 400 'Nội dung is required' when guideline title is missing", async () => {
            req.body = {
                guidelines: [{ content: "Đổ đúng giờ" }]
            };
            await rulesController.createRules(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: { status: 400, message: "Nội dung is required" }
            });
        });

        test("Case 7: Returns 400 'Nội dung is required' when guideline content is empty", async () => {
            req.body = {
                guidelines: [{ title: "Rác", content: "" }]
            };
            await rulesController.createRules(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        // Case 5: Normal - categories valid
        test("Case 5: Returns 201 for case 5 (categories valid)", async () => {
            req.body = {
                categories: [{ title: "Chung", icon: "Home", rules: ["Cấm ồn"] }]
            };
            buildingService.createRules.mockResolvedValue(req.body);
            await rulesController.createRules(req, res);
            expect(res.status).toHaveBeenCalledWith(201);
        });
    });

    describe("updateRules (Test Cases from User Table 2)", () => {
        beforeEach(() => {
            req.params.id = "rule123";
        });

        // Case 4 & 8: Normal - Valid categories and guidelines
        test("Case 4 & 8: Returns 200 when updating with valid categories and guidelines", async () => {
            req.body = {
                categories: [{ title: "Chung", icon: "Home", rules: ["Cấm ồn"] }],
                guidelines: [{ title: "Rác", content: "Đổ đúng giờ" }]
            };
            buildingService.updateRules.mockResolvedValue({ _id: "rule123", ...req.body });

            await rulesController.updateRules(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                message: "Building rules updated successfully"
            }));
        });

        // Case 1: Boundary - Categories as empty array
        test("Case 1: Returns 200 when categories is empty array", async () => {
            req.body = { categories: [] };
            buildingService.updateRules.mockResolvedValue({ _id: "rule123", ...req.body });
            await rulesController.updateRules(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        // Case 2: Abnormal - Category title empty
        test("Case 2: Returns 400 'Path categories.0.title is required' when title is empty string", async () => {
            req.body = {
                categories: [{ title: "", icon: "Home" }]
            };
            await rulesController.updateRules(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: { status: 400, message: "Path `categories.0.title` is required" }
            });
        });

        // Case 3: Boundary - Rules array empty
        test("Case 3: Returns 200 when rules array is empty", async () => {
            req.body = {
                categories: [{ title: "Chung", icon: "Home", rules: [] }]
            };
            buildingService.updateRules.mockResolvedValue({ _id: "rule123", ...req.body });
            await rulesController.updateRules(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        // Case 5: Boundary - Guidelines as empty array
        test("Case 5: Returns 200 when guidelines is empty array", async () => {
            req.body = { guidelines: [] };
            buildingService.updateRules.mockResolvedValue({ _id: "rule123", ...req.body });
            await rulesController.updateRules(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        // Case 6: Abnormal - Guideline title empty
        test("Case 6: Returns 400 'Path guidelines.0.title is required' when guideline title is empty", async () => {
            req.body = {
                guidelines: [{ title: "", content: "Đổ đúng giờ" }]
            };
            await rulesController.updateRules(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: { status: 400, message: "Path `guidelines.0.title` is required" }
            });
        });

        // Case 7: Abnormal - Guideline content empty
        test("Case 7: Returns 400 'Path guidelines.0.content is required' when guideline content is empty", async () => {
            req.body = {
                guidelines: [{ title: "Rác", content: "" }]
            };
            await rulesController.updateRules(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: { status: 400, message: "Path `guidelines.0.content` is required" }
            });
        });
    });

    describe("deleteRules", () => {
        test("returns 200 after deletion", async () => {
            req.params.id = "123";
            buildingService.deleteRules.mockResolvedValue(true);

            await rulesController.deleteRules(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Building rules deleted successfully",
                data: null
            });
        });
    });
});
