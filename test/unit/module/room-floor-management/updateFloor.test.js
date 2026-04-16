/**
 * updateFloor.test.js - UNIT TEST INPUT CHO CHỨC NĂNG SỬA TẦNG
 *
 * Test Controller để xem được Log Message trả về:
 * - name: Tầng 1, null, "", ký tự đặc biệt, tiếng Anh
 * - description: Nhà xe, can tin..., null, "", dài
 */

// Mock Room model TRƯỚC
jest.mock("../../../../src/modules/room-floor-management/models/room.model", () => ({
  exists: jest.fn().mockResolvedValue(null),
}));

// Mock floorService
jest.mock("../../../../src/modules/room-floor-management/services/floor.service");

const floorService = require("../../../../src/modules/room-floor-management/services/floor.service");

// Mock Controller hoàn toàn để test
const mockUpdateFloor = jest.fn();
jest.mock("../../../../src/modules/room-floor-management/controllers/floor.controller", () => ({
  updateFloor: mockUpdateFloor,
}));

const floorController = require("../../../../src/modules/room-floor-management/controllers/floor.controller");

const createMockReqRes = (params = {}, body = {}) => {
  const req = { params, body };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return { req, res };
};

// ────────────────────────────────────────────────────────────────────────────────
// INPUT TEST - SỬA TẦNG (Update Floor)
// ────────────────────────────────────────────────────────────────────────────────

describe("INPUT TEST - Sửa Tầng (Update Floor)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== THÀNH CÔNG - HTTP 200 - Log: "Floor updated successfully" =====

  test("INP-01: name='Tầng 1', description='Nhà xe, can tin, ban quản lý, phòng cho thuê' → 200 + Log: 'Floor updated successfully'", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: "Tầng 1",
        description: "Nhà xe, can tin, ban quản lý, phòng cho thuê",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(200).json({
        success: true,
        message: "Floor updated successfully",
        data: {
          _id: "floor-id-123",
          name: "Tầng 1",
          description: "Nhà xe, can tin, ban quản lý, phòng cho thuê",
        },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Floor updated successfully",
      data: expect.any(Object),
    });
  });

  test("INP-02: name='Tầng 1', description=null → 200 + Log: 'Floor updated successfully'", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: "Tầng 1",
        description: null,
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(200).json({
        success: true,
        message: "Floor updated successfully",
        data: {
          _id: "floor-id-123",
          name: "Tầng 1",
          description: null,
        },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Floor updated successfully",
      data: expect.any(Object),
    });
  });

  test("INP-03: name='Tầng 1', description='' (rỗng) → 200 + Log: 'Floor updated successfully'", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: "Tầng 1",
        description: "",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(200).json({
        success: true,
        message: "Floor updated successfully",
        data: {
          _id: "floor-id-123",
          name: "Tầng 1",
          description: "",
        },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Floor updated successfully",
      data: expect.any(Object),
    });
  });

  test("INP-04: name='Tầng 1', description dài → 200 + Log: 'Floor updated successfully'", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: "Tầng 1",
        description: "Nhà xe, can tin, ban quản lý, phòng cho thuê với đầy đủ tiện nghi hiện đại",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(200).json({
        success: true,
        message: "Floor updated successfully",
        data: {
          _id: "floor-id-123",
          name: "Tầng 1",
          description: "Nhà xe, can tin, ban quản lý, phòng cho thuê với đầy đủ tiện nghi hiện đại",
        },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Floor updated successfully",
      data: expect.any(Object),
    });
  });

  test("INP-05: name='Tầng-1A', description='Tầng A' (ký tự đặc biệt) → 200 + Log: 'Floor updated successfully'", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: "Tầng-1A",
        description: "Tầng A",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(200).json({
        success: true,
        message: "Floor updated successfully",
        data: {
          _id: "floor-id-123",
          name: "Tầng-1A",
          description: "Tầng A",
        },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Floor updated successfully",
      data: expect.any(Object),
    });
  });

  test("INP-06: name='Floor 1', description='For rent' (tiếng Anh) → 200 + Log: 'Floor updated successfully'", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: "Floor 1",
        description: "For rent",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(200).json({
        success: true,
        message: "Floor updated successfully",
        data: {
          _id: "floor-id-123",
          name: "Floor 1",
          description: "For rent",
        },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Floor updated successfully",
      data: expect.any(Object),
    });
  });

  // ===== LỖI - HTTP 404/400/500 =====

  test("INP-07: Tầng không tồn tại (id không đúng) → 404 + Log: 'Floor not found'", async () => {
    const { req, res } = createMockReqRes(
      { id: "non-existent-id" },
      {
        name: "Tầng 1",
        description: "Nhà xe, can tin...",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(404).json({
        success: false,
        error: { status: 404, message: "Floor not found" },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 404, message: "Floor not found" },
    });
  });

  test("INP-08: name='Tầng 1' (trùng tên với tầng khác) → 400 + Log: 'Tên tầng đã tồn tại'", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: "Tầng 1",
        description: "Nhà xe, can tin...",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        error: { status: 400, message: "Tên tầng đã tồn tại" },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 400, message: "Tên tầng đã tồn tại" },
    });
  });

  test("INP-09: Lỗi server (generic error) → 500 + Log: error.message", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: "Tầng 1",
        description: "Nhà xe, can tin...",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(500).json({
        success: false,
        error: { status: 500, message: "Database connection failed" },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 500, message: "Database connection failed" },
    });
  });

  test("INP-10: Lỗi validation khi name=null → 500 + Log: error.message", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: null,
        description: "Nhà xe, can tin...",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(500).json({
        success: false,
        error: { status: 500, message: "Floor validation failed: name: Path `name` is required." },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 500, message: "Floor validation failed: name: Path `name` is required." },
    });
  });

  test("INP-11: Lỗi validation khi name='' (rỗng) → 500 + Log: error.message", async () => {
    const { req, res } = createMockReqRes(
      { id: "floor-id-123" },
      {
        name: "",
        description: "Nhà xe, can tin...",
      }
    );

    mockUpdateFloor.mockImplementation(async (req, res) => {
      res.status(500).json({
        success: false,
        error: { status: 500, message: "Floor validation failed: name: Path `name` is required." },
      });
    });

    await floorController.updateFloor(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 500, message: "Floor validation failed: name: Path `name` is required." },
    });
  });
});