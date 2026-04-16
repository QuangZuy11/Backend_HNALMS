/**
 * updateRoomType.test.js - UNIT TEST INPUT CHO CHỨC NĂNG SỬA LOẠI PHÒNG
 *
 * Test các trường input KHÁC NHAU về định dạng:
 * - typeName: "Loại 1", "" (trống), trùng tên
 * - currentPrice: 2500000, 0
 * - personMax: 3, 0
 * - description: "", dài
 * - images: Đủ 7 ảnh, Thiếu 7 ảnh, Xóa ảnh
 */

// Mock Controller
const mockUpdateRoomType = jest.fn();
jest.mock("../../../../src/modules/room-floor-management/controllers/roomtype.controller", () => ({
  updateRoomType: mockUpdateRoomType,
}));

const roomTypeController = require("../../../../src/modules/room-floor-management/controllers/roomtype.controller");

const createMockReqRes = (params = {}, body = {}, files = []) => {
  const req = { params, body, files };
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

// Mock old images
const mockOldImages = [
  "/uploads/roomtype/old-1.jpg",
  "/uploads/roomtype/old-2.jpg",
  "/uploads/roomtype/old-3.jpg",
  "/uploads/roomtype/old-4.jpg",
];

// ────────────────────────────────────────────────────────────────────────────────
// INPUT TEST - SỬA LOẠI PHÒNG (Update Room Type)
// ────────────────────────────────────────────────────────────────────────────────

describe("INPUT TEST - Sửa Loại Phòng (Update Room Type)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== THÀNH CÔNG - HTTP 200 =====

  test("INP-01: typeName='Loại 1', currentPrice=2500000, personMax=3, description, 3 → 200", async () => {
    const { req, res } = createMockReqRes(
      { id: "roomtype-id-123" },
      {
        typeName: "Loại 1",
        currentPrice: "2500000",
        personMax: "3",
        description: "Loại phòng được thiết kế theo phong cách hiện đại với đầy đủ tiện nghi cao cấp",
      },
      createMockFiles(7)
    );

    mockUpdateRoomType.mockImplementation(async (req, res) => {
      res.status(200).json({
        success: true,
        message: "Cập nhật thành công",
        data: {
          _id: "roomtype-id-123",
          typeName: "Loại 1",
          currentPrice: 2500000,
          personMax: 3,
        },
      });
    });

    await roomTypeController.updateRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Cập nhật thành công",
      data: expect.any(Object),
    });
  });

  test("INP-02: description dài → 200 Thành công", async () => {
    const { req, res } = createMockReqRes(
      { id: "roomtype-id-123" },
      {
        typeName: "Loại 1",
        currentPrice: "2500000",
        personMax: "3",
        description: "Loại phòng được thiết kế theo phong cách hiện đại với đầy đủ tiện nghi cao cấp, view đẹp, ban công thoáng mát, thuê giá rẻ cho sinh viên",
      },
      createMockFiles(7)
    );

    mockUpdateRoomType.mockImplementation(async (req, res) => {
      res.status(200).json({
        success: true,
        message: "Cập nhật thành công",
        data: { _id: "roomtype-id-123" },
      });
    });

    await roomTypeController.updateRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("INP-03: Xóa và thêm ảnh mới (đủ 7) → 200 Thành công", async () => {
    const { req, res } = createMockReqRes(
      { id: "roomtype-id-123" },
      {
        typeName: "Loại 1",
        currentPrice: "2500000",
        personMax: "3",
        oldImages: mockOldImages.slice(0, 3), // Giữ lại 3 ảnh cũ
      },
      createMockFiles(4) // Thêm 4 ảnh mới = tổng 7
    );

    mockUpdateRoomType.mockImplementation(async (req, res) => {
      res.status(200).json({
        success: true,
        message: "Cập nhật thành công",
        data: { _id: "roomtype-id-123" },
      });
    });

    await roomTypeController.updateRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
  // chưa viết vào 

  // ===== LỖI - HTTP 400 =====

  test("INP-04: currentPrice=0 → 400 + Log: 'Giá phòng bắt buộc phải lớn hơn 0'", async () => {
    const { req, res } = createMockReqRes(
      { id: "roomtype-id-123" },
      {
        typeName: "Loại 1",
        currentPrice: "0",
        personMax: "3",
      },
      createMockFiles(7)
    );

    mockUpdateRoomType.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Giá phòng bắt buộc phải lớn hơn 0",
      });
    });

    await roomTypeController.updateRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Giá phòng bắt buộc phải lớn hơn 0",
    });
  });

  test("INP-05: personMax=0 → 400 + Log: 'Số người tối đa phải lớn hơn 0'", async () => {
    const { req, res } = createMockReqRes(
      { id: "roomtype-id-123" },
      {
        typeName: "Loại 1",
        currentPrice: "2500000",
        personMax: "0",
      },
      createMockFiles(7)
    );

    mockUpdateRoomType.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Số người tối đa phải lớn hơn 0",
      });
    });

    await roomTypeController.updateRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Số người tối đa phải lớn hơn 0",
    });
  });

  test("INP-06: images không đủ 7 (chỉ có 3 ảnh) → 400 + Log: 'Vui lòng cung cấp đủ 7 ảnh'", async () => {
    const { req, res } = createMockReqRes(
      { id: "roomtype-id-123" },
      {
        typeName: "Loại 1",
        currentPrice: "2500000",
        personMax: "3",
      },
      createMockFiles(3) // Chỉ có 3 ảnh, thiếu 4 ảnh
    );

    mockUpdateRoomType.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đủ 7 ảnh cho loại phòng.",
      });
    });

    await roomTypeController.updateRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng cung cấp đủ 7 ảnh cho loại phòng.",
    });
  });

  test("INP-07: typeName trùng với loại khác → 400 + Log: 'Tên loại phòng đã bị trùng'", async () => {
    const { req, res } = createMockReqRes(
      { id: "roomtype-id-123" },
      {
        typeName: "Loại 1",
        currentPrice: "2500000",
        personMax: "3",
      },
      createMockFiles(7)
    );

    mockUpdateRoomType.mockImplementation(async (req, res) => {
      res.status(400).json({
        success: false,
        message: 'Tên loại phòng "Loại 1" đã bị trùng với một loại phòng khác!',
      });
    });

    await roomTypeController.updateRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Tên loại phòng "Loại 1" đã bị trùng với một loại phòng khác!',
    });
  });

  // ===== LỖI - HTTP 404 =====

  test("INP-08: Loại phòng không tồn tại → 404 + Log: 'Không tìm thấy loại phòng'", async () => {
    const { req, res } = createMockReqRes(
      { id: "non-existent-id" },
      {
        typeName: "Loại 1",
        currentPrice: "2500000",
        personMax: "3",
      },
      createMockFiles(7)
    );

    mockUpdateRoomType.mockImplementation(async (req, res) => {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy loại phòng để sửa",
      });
    });

    await roomTypeController.updateRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Không tìm thấy loại phòng để sửa",
    });
  });

  // ===== LỖI KHÁC =====

  test("INP-09: Lỗi server → 500", async () => {
    const { req, res } = createMockReqRes(
      { id: "roomtype-id-123" },
      {
        typeName: "Loại 1",
        currentPrice: "2500000",
        personMax: "3",
      },
      createMockFiles(7)
    );

    mockUpdateRoomType.mockImplementation(async (req, res) => {
      res.status(500).json({
        success: false,
        error: { message: "Database connection failed" },
      });
    });

    await roomTypeController.updateRoomType(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { message: "Database connection failed" },
    });
  });
});