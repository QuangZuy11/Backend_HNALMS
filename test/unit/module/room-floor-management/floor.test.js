/**
 * floor.test.js - UNIT TEST INPUT CHO CHỨC NĂNG THÊM TẦNG
 *
 * Test các trường input mà người dùng nhập vào:
 * - name: Tầng 1, null, "", ký tự đặc biệt, tiếng Anh
 * - description: Phòng cho thuê, null, "", dài
 */

const floorService = require("../../../../src/modules/room-floor-management/services/floor.service");

// Mock floorService
jest.mock("../../../../src/modules/room-floor-management/services/floor.service", () => ({
  createFloor: jest.fn(),
}));

// Mock Room model
jest.mock("../../../../src/modules/room-floor-management/models/room.model", () => ({
  exists: jest.fn().mockResolvedValue(null),
}));

const floorController = require("../../../../src/modules/room-floor-management/controllers/floor.controller");

const createMockReqRes = (body = {}) => {
  const req = { body };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return { req, res };
};

// ────────────────────────────────────────────────────────────────────────────────
// INPUT TEST - KẾT HỢP NAME + DESCRIPTION
// ────────────────────────────────────────────────────────────────────────────────

describe("INPUT TEST - Thêm Tầng (Create Floor)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== THÀNH CÔNG - NORMAL CASES =====

  test("INP-01: name='Tầng 1', description='Phòng cho thuê' → 201 Thành công", async () => {
    const { req, res } = createMockReqRes({
      name: "Tầng 1",
      description: "Phòng cho thuê",
    });

    floorService.createFloor.mockResolvedValue({
      _id: "mock-id",
      name: "Tầng 1",
      description: "Phòng cho thuê",
    });

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Floor created successfully",
      })
    );
  });

  test("INP-02: name='Tầng 1', description=null → 201 Thành công", async () => {
    const { req, res } = createMockReqRes({
      name: "Tầng 1",
      description: null,
    });

    floorService.createFloor.mockResolvedValue({
      _id: "mock-id",
      name: "Tầng 1",
      description: null,
    });

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Floor created successfully",
      })
    );
  });

  test("INP-03: name='Tầng 1', description='' (rỗng) → 201 Thành công", async () => {
    const { req, res } = createMockReqRes({
      name: "Tầng 1",
      description: "",
    });

    floorService.createFloor.mockResolvedValue({
      _id: "mock-id",
      name: "Tầng 1",
      description: "",
    });

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Floor created successfully",
      })
    );
  });

  test("INP-04: name='Tầng 1', description dài → 201 Thành công", async () => {
    const { req, res } = createMockReqRes({
      name: "Tầng 1",
      description: "Phòng cho thuê với đầy đủ tiện nghi hiện đại, có ban công thoáng mát",
    });

    floorService.createFloor.mockResolvedValue({
      _id: "mock-id",
      name: "Tầng 1",
      description: "Phòng cho thuê với đầy đủ tiện nghi hiện đại, có ban công thoáng mát",
    });

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Floor created successfully",
      })
    );
  });

  test("INP-05: name='Tầng 1', description='Tầng trống' (khác mô tả) → 201 Thành công", async () => {
    const { req, res } = createMockReqRes({
      name: "Tầng 1",
      description: "Tầng trống",
    });

    floorService.createFloor.mockResolvedValue({
      _id: "mock-id",
      name: "Tầng 1",
      description: "Tầng trống",
    });

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("INP-06: name='Tầng-1A', description='Tầng A' (ký tự đặc biệt) → 201 Thành công", async () => {
    const { req, res } = createMockReqRes({
      name: "Tầng-1A",
      description: "Tầng A",
    });

    floorService.createFloor.mockResolvedValue({
      _id: "mock-id",
      name: "Tầng-1A",
      description: "Tầng A",
    });

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("INP-07: name='Floor 1', description='For rent' (tiếng Anh) → 201 Thành công", async () => {
    const { req, res } = createMockReqRes({
      name: "Floor 1",
      description: "For rent",
    });

    floorService.createFloor.mockResolvedValue({
      _id: "mock-id",
      name: "Floor 1",
      description: "For rent",
    });

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  // ===== LỖI - ERROR CASES =====

  test("INP-08: name=null, description='Phòng cho thuê' → 500 Lỗi validation", async () => {
    const { req, res } = createMockReqRes({
      name: null,
      description: "Phòng cho thuê",
    });

    floorService.createFloor.mockRejectedValue(
      new Error("Floor validation failed: name: Path `name` is required.")
    );

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
      })
    );
  });

  test("INP-09: name='', description='Phòng cho thuê' (name rỗng) → 500 Lỗi validation", async () => {
    const { req, res } = createMockReqRes({
      name: "",
      description: "Phòng cho thuê",
    });

    floorService.createFloor.mockRejectedValue(
      new Error("Floor validation failed: name: Path `name` is required.")
    );

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test("INP-10: name='Tầng 1' (trùng tên) → 400 Lỗi trùng", async () => {
    const { req, res } = createMockReqRes({
      name: "Tầng 1",
      description: "Phòng cho thuê",
    });

    floorService.createFloor.mockRejectedValue({ code: 11000 });

    await floorController.createFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 400, message: "Tên tầng đã tồn tại" },
    });
  });
});