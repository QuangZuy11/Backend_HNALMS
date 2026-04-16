/**
 * createFloor.test.js - UNIT TEST INPUT CHO CHỨC NĂNG THÊM TẦNG
 *
 * Test các trường input mà người dùng nhập vào:
 * - name: Tầng 1, null, "", ký tự đặc biệt, tiếng Anh
 * - description: Phòng cho thuê, null, "", dài
 */

const Floor = require("../../../../src/modules/room-floor-management/models/floor.model");
const Room = require("../../../../src/modules/room-floor-management/models/room.model");

// Mock Floor model
jest.mock("../../../../src/modules/room-floor-management/models/floor.model");

// Mock Room model (service kiểm tra có phòng không)
jest.mock("../../../../src/modules/room-floor-management/models/room.model", () => ({
  exists: jest.fn().mockResolvedValue(null),
}));

const floorService = require("../../../../src/modules/room-floor-management/services/floor.service");

// Mock constructor của Floor model
const mockFloorSave = jest.fn();
Floor.mockImplementation((data) => ({
  ...data,
  save: mockFloorSave,
}));

// ────────────────────────────────────────────────────────────────────────────────
// INPUT TEST - THÊM TẦNG (Create Floor)
// ────────────────────────────────────────────────────────────────────────────────

describe("INPUT TEST - Thêm Tầng (Create Floor)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("INP-01: name='Tầng 1', description='Phòng cho thuê' → Thành công", async () => {
    const input = {
      name: "Tầng 1",
      description: "Phòng cho thuê",
    };

    mockFloorSave.mockResolvedValue({
      _id: "mock-floor-id",
      ...input,
    });

    const result = await floorService.createFloor(input);

    expect(Floor).toHaveBeenCalledWith(input);
    expect(result.name).toBe("Tầng 1");
    expect(result.description).toBe("Phòng cho thuê");
  });

  test("INP-02: name='Tầng 1', description=null → Thành công", async () => {
    const input = {
      name: "Tầng 1",
      description: null,
    };

    mockFloorSave.mockResolvedValue({
      _id: "mock-floor-id",
      ...input,
    });

    const result = await floorService.createFloor(input);

    expect(result.description).toBeNull();
  });

  test("INP-03: name='Tầng 1', description='' (rỗng) → Thành công", async () => {
    const input = {
      name: "Tầng 1",
      description: "",
    };

    mockFloorSave.mockResolvedValue({
      _id: "mock-floor-id",
      ...input,
    });

    const result = await floorService.createFloor(input);

    expect(result.description).toBe("");
  });

  test("INP-04: name='Tầng 1', description='Nhà xe, can tin, ban quản lý, phòng cho thuê' → Thành công", async () => {
    const input = {
      name: "Tầng 1",
      description: "Nhà xe, can tin, ban quản lý, phòng cho thuê",
    };

    mockFloorSave.mockResolvedValue({
      _id: "mock-floor-id",
      ...input,
    });

    const result = await floorService.createFloor(input);

    expect(result.description).toBe("Nhà xe, can tin, ban quản lý, phòng cho thuê");
  });

  test("INP-05: name='Tầng 1', description dài → Thành công", async () => {
    const input = {
      name: "Tầng 1",
      description: "Nhà xe, can tin, ban quản lý, phòng cho thuê với đầy đủ tiện nghi hiện đại, có ban công thoáng mát",
    };

    mockFloorSave.mockResolvedValue({
      _id: "mock-floor-id",
      ...input,
    });

    const result = await floorService.createFloor(input);

    expect(result.description).toBe("Nhà xe, can tin, ban quản lý, phòng cho thuê với đầy đủ tiện nghi hiện đại, có ban công thoáng mát");
  });

  test("INP-06: name='Tầng-1A', description='Tầng A' (ký tự đặc biệt) → Thành công", async () => {
    const input = {
      name: "Tầng-1A",
      description: "Tầng A",
    };

    mockFloorSave.mockResolvedValue({
      _id: "mock-floor-id",
      ...input,
    });

    const result = await floorService.createFloor(input);

    expect(result.name).toBe("Tầng-1A");
    expect(result.description).toBe("Tầng A");
  });

  test("INP-07: name='Floor 1', description='For rent' (tiếng Anh) → Thành công", async () => {
    const input = {
      name: "Floor 1",
      description: "For rent",
    };

    mockFloorSave.mockResolvedValue({
      _id: "mock-floor-id",
      ...input,
    });

    const result = await floorService.createFloor(input);

    expect(result.name).toBe("Floor 1");
    expect(result.description).toBe("For rent");
  });

  // ===== LỖI - ERROR CASES =====

  test("INP-08: name='Tầng 1' (trùng tên) → Lỗi E11000", async () => {
    const input = {
      name: "Tầng 1",
      description: "Phòng cho thuê",
    };

    mockFloorSave.mockRejectedValue({ code: 11000 });

    await expect(floorService.createFloor(input)).rejects.toMatchObject({ code: 11000 });
  });

  test("INP-09: name=null → Lỗi validation", async () => {
    const input = {
      name: null,
      description: "Phòng cho thuê",
    };

    mockFloorSave.mockRejectedValue(
      new Error("Floor validation failed: name: Path `name` is required.")
    );

    await expect(floorService.createFloor(input)).rejects.toThrow("name: Path `name` is required");
  });

  test("INP-10: name='' (rỗng) → Lỗi validation", async () => {
    const input = {
      name: "",
      description: "Phòng cho thuê",
    };

    mockFloorSave.mockRejectedValue(
      new Error("Floor validation failed: name: Path `name` is required.")
    );

    await expect(floorService.createFloor(input)).rejects.toThrow("name: Path `name` is required");
  });
});