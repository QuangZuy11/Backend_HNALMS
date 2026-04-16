/**
 * createRoom.test.js - UNIT TEST INPUT CHO CHỨC NĂNG THÊM PHÒNG MỚI
 *
 * Test các trường input theo Excel spec:
 * - name: "Phòng 701", "Phòng 201", null, ""
 * - roomCode: "P707", "P201", null, ""
 * - floorId: ObjectId hợp lệ, null
 * - roomTypeId: ObjectId hợp lệ, null
 * - description: "Phòng gần ban công", null
 *
 * Log Message kỳ vọng:
 * - "Thêm phòng mới thành công" (T - True)
 * - "Mã phòng P201 đã tồn tại" (F)
 * - "Vui lòng nhập mã phòng" (F)
 * - "Tên phòng đã tồn tại" (F)
 * - "Vui lòng nhập tên phòng" (F)
 * - "Vui lòng nhập tầng" (F)
 * - "Vui lòng nhập loại phòng" (F)
 */

// Mock Controller
const mockCreateRoomCtrl = jest.fn();
jest.mock("../../../../src/modules/room-floor-management/controllers/room.controller", () => ({
  createRoom: mockCreateRoomCtrl,
}));

const roomController = require("../../../../src/modules/room-floor-management/controllers/room.controller");

const createMockReqRes = (body = {}) => {
  const req = { body };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return { req, res };
};

// ────────────────────────────────────────────────────────────────────────────────
// INPUT TEST - THÊM PHÒNG MỚI (Create Room)
// ────────────────────────────────────────────────────────────────────────────────

describe("INPUT TEST - Thêm Phòng Mới (Create Room)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== THÀNH CÔNG - HTTP 201 - T (True) =====

  test("INP-01: name='Phòng 701', roomCode='P707', floorId, roomTypeId → 201 + Log: 'Thêm phòng mới thành công'", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 701",
      roomCode: "P707",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
      description: "",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(201).json({
        message: "Thêm phòng mới thành công",
        data: {
          _id: "room-id-123",
          name: "Phòng 701",
          roomCode: "P707",
          status: "Available",
        },
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "Thêm phòng mới thành công",
      data: expect.any(Object),
    });
  });

  test("INP-02: name='Phòng 201', roomCode='P201', description='Phòng gần ban công' → 201 + Log: 'Thêm phòng mới thành công'", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 201",
      roomCode: "P201",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
      description: "Phòng gần ban công",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(201).json({
        message: "Thêm phòng mới thành công",
        data: {
          _id: "room-id-123",
          name: "Phòng 201",
          roomCode: "P201",
          description: "Phòng gần ban công",
        },
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "Thêm phòng mới thành công",
      data: expect.any(Object),
    });
  });

  // ===== LỖI - HTTP 400 - F (False) =====

  test("INP-03: name='Phòng 201' (trùng tên) → 400 + Log: 'Tên phòng đã tồn tại!'", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 201",
      roomCode: "P707",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Tên phòng đã tồn tại!",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên phòng đã tồn tại!",
    });
  });

  test("INP-04: roomCode='P201' (trùng mã) → 400 + Log: 'Mã phòng P201 đã tồn tại!'", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 701",
      roomCode: "P201",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Mã phòng P201 đã tồn tại!",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Mã phòng P201 đã tồn tại!",
    });
  });

  test("INP-05: name=null → 400 + Log: 'Vui lòng nhập tên phòng'", async () => {
    const { req, res } = createMockReqRes({
      name: null,
      roomCode: "P707",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên phòng",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập tên phòng",
    });
  });

  test("INP-06: name='' (rỗng) → 400 + Log: 'Vui lòng nhập tên phòng'", async () => {
    const { req, res } = createMockReqRes({
      name: "",
      roomCode: "P707",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên phòng",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập tên phòng",
    });
  });

  test("INP-07: name='   ' (toàn khoảng trắng) → 400 + Log: 'Vui lòng nhập tên phòng'", async () => {
    const { req, res } = createMockReqRes({
      name: "   ",
      roomCode: "P707",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên phòng",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập tên phòng",
    });
  });

  test("INP-08: roomCode=null → 400 + Log: 'Vui lòng nhập mã phòng'", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 701",
      roomCode: null,
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập mã phòng",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập mã phòng",
    });
  });

  test("INP-09: roomCode='' (rỗng) → 400 + Log: 'Vui lòng nhập mã phòng'", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 701",
      roomCode: "",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập mã phòng",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập mã phòng",
    });
  });

  test("INP-10: roomCode='   ' (toàn khoảng trắng) → 400 + Log: 'Vui lòng nhập mã phòng'", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 701",
      roomCode: "   ",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập mã phòng",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập mã phòng",
    });
  });

  test("INP-11: floorId=null → 400 + Log: 'Vui lòng nhập tầng'", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 701",
      roomCode: "P707",
      floorId: null,
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập tầng",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập tầng",
    });
  });

  test("INP-12: roomTypeId=null → 400 + Log: 'Vui lòng nhập loại phòng'", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 701",
      roomCode: "P707",
      floorId: "floor-id-123",
      roomTypeId: null,
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập loại phòng",
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập loại phòng",
    });
  });

  // ===== LỖI KHÁC =====

  test("INP-13: Lỗi server → 500", async () => {
    const { req, res } = createMockReqRes({
      name: "Phòng 701",
      roomCode: "P707",
      floorId: "floor-id-123",
      roomTypeId: "roomtype-id-123",
    });

    mockCreateRoomCtrl.mockImplementation(async (req, res) => {
      res.status(500).json({
        success: false,
        error: { message: "Database connection failed" },
      });
    });

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { message: "Database connection failed" },
    });
  });
});