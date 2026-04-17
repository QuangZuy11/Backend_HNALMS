const mongoose = require("mongoose");
const buildingService = require("../../../../src/modules/building-information/services/building.service");
const BuildingRules = require("../../../../src/modules/building-information/models/building-rules.model");

// Mock Model
jest.mock("../../../../src/modules/building-information/models/building-rules.model");
jest.spyOn(console, 'error').mockImplementation(() => { });

describe("BuildingService Unit Tests", () => {
    let mockBuildingRulesInstance;

    beforeEach(() => {
        mockBuildingRulesInstance = {
            _id: "rule123",
            save: jest.fn(),
        };
        BuildingRules.mockImplementation(() => mockBuildingRulesInstance);
        jest.clearAllMocks();
    });

    describe("getActiveRules", () => {
        test("returns active rules using findOne and lean", async () => {
            const mockRules = { _id: "rule1", status: "active" };
            const chainMock = {
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(mockRules),
            };
            BuildingRules.findOne.mockReturnValue(chainMock);

            const result = await buildingService.getActiveRules();

            expect(BuildingRules.findOne).toHaveBeenCalledWith({ status: "active" });
            expect(result).toEqual(mockRules);
        });
    });

    describe("createRules", () => {
        test("creates new rules if none exists", async () => {
            BuildingRules.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });
            mockBuildingRulesInstance.save.mockResolvedValue(mockBuildingRulesInstance);

            const rulesData = { categories: [{ title: "General", icon: "Home" }] };
            const result = await buildingService.createRules(rulesData);

            expect(mockBuildingRulesInstance.save).toHaveBeenCalled();
            expect(result).toBe(mockBuildingRulesInstance);
        });

        test("pushes to existing rules if one already exists", async () => {
            const existingRule = { _id: "existingId" };
            BuildingRules.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(existingRule)
            });

            const mockFindOneAndUpdate = jest.fn().mockResolvedValue({ _id: "existingId", categories: ["new"] });
            BuildingRules.collection = {
                findOneAndUpdate: mockFindOneAndUpdate
            };

            const rulesData = { 
                categories: [{ title: "New Cat", icon: "Clock", rules: ["R1"] }],
                guidelines: [{ title: "New Guide", content: "C1" }],
                status: "active"
            };

            const result = await buildingService.createRules(rulesData);

            expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
                { _id: existingRule._id },
                {
                    $push: {
                        categories: { $each: [{ title: "New Cat", icon: "Clock", rules: ["R1"] }] },
                        guidelines: { $each: [{ title: "New Guide", content: "C1" }] }
                    },
                    $set: { status: "active" }
                },
                { returnDocument: "after" }
            );
            expect(result).toEqual({ _id: "existingId", categories: ["new"] });
        });
    });

    describe("updateRules", () => {
        test("updates rules using findOneAndUpdate with stripped _id", async () => {
            const mockFindOneAndUpdate = jest.fn().mockResolvedValue({ _id: "id1", title: "Updated" });
            BuildingRules.collection = {
                findOneAndUpdate: mockFindOneAndUpdate
            };

            const updateData = { 
                _id: "id1",
                categories: [{ _id: "cat1", title: "A" }],
                guidelines: [{ _id: "guide1", title: "B" }],
                status: "inactive"
            };

            const result = await buildingService.updateRules("id1", updateData);

            expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
                { _id: "id1" },
                {
                    $set: {
                        categories: [{ title: "A" }], // _id stripped
                        guidelines: [{ title: "B" }], // _id stripped
                        status: "inactive"
                    }
                },
                { returnDocument: "after" }
            );
            expect(result).toEqual({ _id: "id1", title: "Updated" });
        });

        test("throws error if rule not found", async () => {
            BuildingRules.collection = {
                findOneAndUpdate: jest.fn().mockResolvedValue(null)
            };

            await expect(buildingService.updateRules("id1", {}))
                .rejects.toThrow("Building rule not found");
        });
    });

    describe("deleteRules", () => {
        test("deletes rules using findOneAndDelete", async () => {
            const mockFindOneAndDelete = jest.fn().mockResolvedValue({ _id: "id1" });
            BuildingRules.collection = {
                findOneAndDelete: mockFindOneAndDelete
            };

            const result = await buildingService.deleteRules("id1");

            expect(mockFindOneAndDelete).toHaveBeenCalledWith({ _id: "id1" });
            expect(result).toEqual({ _id: "id1" });
        });

        test("throws error if rule not found for deletion", async () => {
            BuildingRules.collection = {
                findOneAndDelete: jest.fn().mockResolvedValue(null)
            };

            await expect(buildingService.deleteRules("id1"))
                .rejects.toThrow("Building rule not found");
        });
    });
});
