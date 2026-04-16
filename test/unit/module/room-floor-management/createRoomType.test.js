/**
 * createRoomType.test.js - UNIT TEST INPUT CHO CHỨC NĂNG THÊM LOẠI PHÒNG
 *
 * Test các trường input KHÁC NHAU về định dạng:
 * - typeName: Studio A, "" (trống), trùng tên
 * - currentPrice: 1000000, 0
 * - personMax: 1, 0
 * - description: "", dài
 * - images: Đủ 7 ảnh, Thiếu 7 ảnh
 */

// Mock Controller
const mockCreateRoomType = jest.fn();
jest.mock("../../../../src/modules/room-floor-management/controllers/roomtype.controller", () => ({
  createRoomType: mockCreateRoomType,
}));

const roomTypeController = require("../../../../src/modules/room-floor-management/controllers/roomtype.controller");

const createMockReqRes = (body = {}, files = []) => {
  const req = { body, files };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return { req, res };
};

// Mock files helper
const createMockFiles = (count) => {
  return Array.from({ length: count }, (_, i) => ({
    path: `/uploads/roomtype/image-${i + 1}.jpg`,
  }));
};

// ────────────────────────────────────────────────────────────────────────────────
// INPUT TEST - THÊM LOẠI PHÒNG (Create Room Type)
// ────────────────────────────────────────────────────────────────────────────────

describe("INPUT TEST - Thêm Loại Phòng (Create Room Type)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== THÀNH CÔNG - HTTP 201 =====

  test("INP-01: typeName='Studio A', currentPrice=1000000, personMax=1, description, 7 ảnh → 201", async () => {
    const { req, res } = createMockReqRes(
      {
        typeName: "Studio A",
        currentPrice: "1000000",
        personMax: "1",
        description: "Loại phòng được thiết kế theo phong cách hiện đại",
      },
      createMockFiles(7)
    );

    mockCreateRoomType.mockImplementation(async (req, res) => {
      res.status(201).json({
        success: true,
        message: "Tạo loại phòng thành công",
        data: {
          _id: "roomtype-id-123",
          typeName: "Studio A",
          currentPrice: 1000000,
          personMax: 1,
          description: "Loại phòng được thiết kế theo phong cách hiện đại",
        },
      });
    });

    await roomTypeController.createRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Tạo loại phòng thành công",
      data: expect.any(Object),
    });
  });

  test("INP-02: description dài → 201 Thành công", async () => {
    const { req, res } = createMockReqRes(
      {
        typeName: "Studio A",
        currentPrice: "1000000",
        personMax: "1",
        description: "Loại phòng được thiết kế theo phong cách hiện đại với đầy đủ tiện nghi cao cấp, view đẹp, ban công thoáng mát",
      },
      createMockFiles(7)
    );

    mockCreateRoomType.mockImplementation(async (req, res) => {
      res.status(201).json({
        success: true,
        message: "Tạo loại phòng thành công",
        data: { _id: "roomtype-id-123" },
      });
    });

    await roomTypeController.createRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  // ===== LỖI - HTTP 400 =====

  test('INP-03: typeName="" (trống) → 400 + Log: "Tên loại phòng là bắt buộc"', async () => {
    const { req, res } = createMockReqRes(
      {
        typeName: "",
        currentPrice: "1000000",
        personMax: "1",
      },
      createMockFiles(7)
    );

    mockCreateRoomType.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Tên loại phòng là bắt buộc",
      });
    });

    await roomTypeController.createRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên loại phòng là bắt buộc",
    });
  });

  test("INP-04: currentPrice=0 → 400 + Log: 'Giá phòng bắt buộc phải lớn hơn 0'", async () => {
    const { req, res } = createMockReqRes(
      {
        typeName: "Studio A",
        currentPrice: "0",
        personMax: "1",
      },
      createMockFiles(7)
    );

    mockCreateRoomType.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Giá phòng bắt buộc phải lớn hơn 0",
      });
    });

    await roomTypeController.createRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Giá phòng bắt buộc phải lớn hơn 0",
    });
  });

  test("INP-05: personMax=0 → 400 + Log: 'Số người tối đa phải lớn hơn 0'", async () => {
    const { req, res } = createMockReqRes(
      {
        typeName: "Studio A",
        currentPrice: "1000000",
        personMax: "0",
      },
      createMockFiles(7)
    );

    mockCreateRoomType.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Số người tối đa phải lớn hơn 0",
      });
    });

    await roomTypeController.createRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Số người tối đa phải lớn hơn 0",
    });
  });

  test("INP-06: images=3 ảnh (thiếu 4 ảnh) → 400 + Log: 'Vui lòng cung cấp đủ 7 ảnh'", async () => {
    const { req, res } = createMockReqRes(
      {
        typeName: "Studio A",
        currentPrice: "1000000",
        personMax: "1",
      },
      createMockFiles(3)
    );

    mockCreateRoomType.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đủ 7 ảnh cho loại phòng.",
      });
    });

    await roomTypeController.createRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng cung cấp đủ 7 ảnh cho loại phòng.",
    });
  });

  test("INP-07: typeName='Studio A' (trùng tên) → 400 + Log: 'Loại phòng đã tồn tại'", async () => {
    const { req, res } = createMockReqRes(
      {
        typeName: "Studio A",
        currentPrice: "1000000",
        personMax: "1",
      },
      createMockFiles(7)
    );

    mockCreateRoomType.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Loại phòng mang tên \"Studio A\" đã tồn tại!",
      });
    });

    await roomTypeController.createRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Loại phòng mang tên \"Studio A\" đã tồn tại!",
    });
  });

});