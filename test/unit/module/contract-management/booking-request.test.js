const BookingRequestController = require("../../../../src/modules/contract-management/controllers/booking-request.controller");
const BookingRequest = require("../../../../src/modules/contract-management/models/booking-request.model");
const Room = require("../../../../src/modules/room-floor-management/models/room.model");
const UserInfo = require("../../../../src/modules/authentication/models/userInfor.model");
const mongoose = require("mongoose");

jest.mock("../../../../src/modules/contract-management/models/booking-request.model");
jest.mock("../../../../src/modules/room-floor-management/models/room.model");
jest.mock("../../../../src/modules/authentication/models/userInfor.model");

describe("BookingRequestController - createBookingRequest", () => {
  let mockReq, mockRes;

  /**
   * Note: createBookingRequest không yêu cầu authentication
   * Bất cứ ai cũng có thể gửi yêu cầu đặt phòng mà không cần đăng nhập
   * (req.user không bắt buộc)
   */

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock request (không cần req.user vì không yêu cầu authentication)
    mockReq = {
      body: {},
    };

    // Setup mock response
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe("Success Cases", () => {
    test("should allow guest to create booking request without login (no req.user required)", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      const newBookingRequest = {
        _id: new mongoose.Types.ObjectId(),
        roomId: mockRoomId,
        name: "Khách Vãng Lai",
        email: "guest@example.com",
        phone: "0901234567",
        idCard: "123456789",
        dob: new Date("1990-05-15"),
        address: "123 Đường ABC, TP HCM",
        startDate: new Date("2024-05-01"),
        duration: 12,
        prepayMonths: 2,
        coResidents: [],
        status: "Pending",
      };

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Khách Vãng Lai",
        email: "guest@example.com",
        phone: "0901234567",
        idCard: "123456789",
        dob: "1990-05-15",
        address: "123 Đường ABC, TP HCM",
        startDate: "2024-05-01",
        duration: 12,
        prepayMonths: 2,
        coResidents: [],
      };
      // mockReq.user không cần thiết - không yêu cầu authentication

      Room.findById.mockResolvedValue({ _id: mockRoomId });
      BookingRequest.prototype.save = jest.fn().mockResolvedValue(newBookingRequest);

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining("gửi thành công"),
          data: expect.any(Object),
        })
      );
    });

    test("should successfully create booking request with existing userInfoId", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();
      const mockUserInfoId = new mongoose.Types.ObjectId();

      const existingUserInfo = {
        _id: mockUserInfoId,
        fullname: "Nguyễn Văn A",
        email: "a@example.com",
        phone: "0901234567",
        cccd: "123456789",
      };

      const newBookingRequest = {
        _id: new mongoose.Types.ObjectId(),
        roomId: mockRoomId,
        userInfoId: mockUserInfoId,
        startDate: new Date("2024-05-01"),
        duration: 12,
        prepayMonths: 2,
        coResidents: [],
        status: "Pending",
      };

      mockReq.body = {
        roomId: mockRoomId.toString(),
        userInfoId: mockUserInfoId.toString(),
        startDate: "2024-05-01",
        duration: 12,
        prepayMonths: 2,
        coResidents: [],
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });
      UserInfo.findById.mockResolvedValue(existingUserInfo);
      BookingRequest.prototype.save = jest.fn().mockResolvedValue(newBookingRequest);

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining("gửi thành công"),
          data: expect.any(Object),
        })
      );
    });

    test("should successfully create booking request with new personal info", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      const newBookingRequest = {
        _id: new mongoose.Types.ObjectId(),
        roomId: mockRoomId,
        name: "Trần Thị B",
        email: "b@example.com",
        phone: "0987654321",
        idCard: "987654321",
        dob: new Date("1990-05-15"),
        address: "123 Đường ABC, TP HCM",
        startDate: new Date("2024-06-01"),
        duration: 12,
        prepayMonths: 2,
        coResidents: [],
        status: "Pending",
      };

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Trần Thị B",
        email: "b@example.com",
        phone: "0987654321",
        idCard: "987654321",
        dob: "1990-05-15",
        address: "123 Đường ABC, TP HCM",
        startDate: "2024-06-01",
        duration: 12,
        prepayMonths: 2,
        coResidents: [],
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });
      BookingRequest.prototype.save = jest.fn().mockResolvedValue(newBookingRequest);

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining("gửi thành công"),
          data: expect.any(Object),
        })
      );
    });

    test("should use default values for optional fields", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      const newBookingRequest = {
        _id: new mongoose.Types.ObjectId(),
        roomId: mockRoomId,
        name: "Lê Văn C",
        email: "c@example.com",
        phone: "0912345678",
        idCard: "111111111",
        startDate: new Date("2024-07-01"),
        duration: 12, // default
        prepayMonths: 2, // default
        coResidents: [],
        status: "Pending",
      };

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Lê Văn C",
        email: "c@example.com",
        phone: "0912345678",
        idCard: "111111111",
        startDate: "2024-07-01",
        // duration and prepayMonths not provided
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });
      BookingRequest.prototype.save = jest.fn().mockResolvedValue(newBookingRequest);

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            duration: 12,
            prepayMonths: 2,
          }),
        })
      );
    });

    test("should handle coResidents array correctly", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      const coResidents = [
        { fullName: "Nguyễn Văn D", cccd: "222222222" },
        { fullName: "Phạm Thị E", cccd: "333333333" },
      ];

      const newBookingRequest = {
        _id: new mongoose.Types.ObjectId(),
        roomId: mockRoomId,
        name: "Hoàng Văn F",
        email: "f@example.com",
        phone: "0923456789",
        idCard: "444444444",
        startDate: new Date("2024-08-01"),
        duration: 12,
        prepayMonths: 2,
        coResidents,
        status: "Pending",
      };

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Hoàng Văn F",
        email: "f@example.com",
        phone: "0923456789",
        idCard: "444444444",
        startDate: "2024-08-01",
        coResidents,
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });
      BookingRequest.prototype.save = jest.fn().mockResolvedValue(newBookingRequest);

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            coResidents,
          }),
        })
      );
    });

    test("should convert string values to correct types", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Đỗ Văn G",
        email: "g@example.com",
        phone: "0934567890",
        idCard: "555555555",
        dob: "1995-03-20",
        address: "456 Đường XYZ, TP HCM",
        startDate: "2024-09-01",
        duration: "24", // string
        prepayMonths: "6", // string
        coResidents: [],
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });

      const saveHandler = jest.fn().mockImplementation(async function () {
        // Verify that duration and prepayMonths were converted to numbers
        expect(this.duration).toBe(24);
        expect(this.prepayMonths).toBe(6);
        return {
          _id: new mongoose.Types.ObjectId(),
          ...this,
          save: jest.fn(),
        };
      });

      BookingRequest.prototype.save = saveHandler;

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });

  describe("Error Cases - Missing Fields", () => {
    test("should return 404 error when room is not found", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Test User",
        email: "test@example.com",
        phone: "0901234567",
        idCard: "123456789",
        startDate: "2024-05-01",
      };

      Room.findById.mockResolvedValue(null);

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("Không tìm thấy phòng"),
        })
      );
      expect(BookingRequest.prototype.save).not.toHaveBeenCalled();
    });

    test("should return 404 error when userInfoId does not exist", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();
      const mockUserInfoId = new mongoose.Types.ObjectId();

      mockReq.body = {
        roomId: mockRoomId.toString(),
        userInfoId: mockUserInfoId.toString(),
        startDate: "2024-05-01",
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });
      UserInfo.findById.mockResolvedValue(null);

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("userInfoId không hợp lệ"),
        })
      );
      expect(BookingRequest.prototype.save).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    test("should handle coResidents as empty array when not provided", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Võ Văn H",
        email: "h@example.com",
        phone: "0945678901",
        idCard: "666666666",
        startDate: "2024-10-01",
        // coResidents not provided
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });

      const newBookingRequest = {
        _id: new mongoose.Types.ObjectId(),
        roomId: mockRoomId,
        name: "Võ Văn H",
        coResidents: [],
      };

      BookingRequest.prototype.save = jest.fn().mockResolvedValue(newBookingRequest);

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    test("should convert non-array coResidents to empty array", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Bùi Văn I",
        email: "i@example.com",
        phone: "0956789012",
        idCard: "777777777",
        startDate: "2024-11-01",
        coResidents: "not-an-array", // invalid type
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });

      BookingRequest.prototype.save = jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        coResidents: [],
      });

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    test("should handle prepayMonths='all' correctly", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Tô Văn J",
        email: "j@example.com",
        phone: "0967890123",
        idCard: "888888888",
        startDate: "2024-12-01",
        duration: 12,
        prepayMonths: "all",
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });

      const newBookingRequest = {
        _id: new mongoose.Types.ObjectId(),
        roomId: mockRoomId,
        name: "Tô Văn J",
        prepayMonths: "all",
      };

      BookingRequest.prototype.save = jest.fn().mockResolvedValue(newBookingRequest);

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            prepayMonths: "all",
          }),
        })
      );
    });

    test("should log appropriate message when using existing UserInfo", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();
      const mockUserInfoId = new mongoose.Types.ObjectId();

      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      const existingUserInfo = {
        _id: mockUserInfoId,
        fullname: "Nguyễn Thị K",
      };

      mockReq.body = {
        roomId: mockRoomId.toString(),
        userInfoId: mockUserInfoId.toString(),
        startDate: "2025-01-01",
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });
      UserInfo.findById.mockResolvedValue(existingUserInfo);
      BookingRequest.prototype.save = jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        userInfoId: mockUserInfoId,
      });

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[BOOKING REQUEST]")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("using existing UserInfo")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Database Interaction", () => {
    test("should save booking request to database with correct status", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Ngô Văn L",
        email: "l@example.com",
        phone: "0978901234",
        idCard: "999999999",
        startDate: "2025-02-01",
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });

      const mockSave = jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        status: "Pending",
      });

      BookingRequest.prototype.save = mockSave;

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockSave).toHaveBeenCalled();
    });

    test("should handle database errors gracefully", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Hà Văn M",
        email: "m@example.com",
        phone: "0989012345",
        idCard: "101010101",
        startDate: "2025-03-01",
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });
      BookingRequest.prototype.save = jest
        .fn()
        .mockRejectedValue(new Error("Database error"));

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Lỗi máy chủ.",
        })
      );
    });
  });

  describe("Date Handling", () => {
    test("should correctly parse and store startDate", async () => {
      // Arrange
      const mockRoomId = new mongoose.Types.ObjectId();
      const testDate = "2025-04-15";

      mockReq.body = {
        roomId: mockRoomId.toString(),
        name: "Quách Văn N",
        email: "n@example.com",
        phone: "0990123456",
        idCard: "111111110",
        startDate: testDate,
        dob: "1998-06-10",
      };

      Room.findById.mockResolvedValue({ _id: mockRoomId });

      const capturedRequest = {};
      BookingRequest.prototype.save = jest.fn().mockImplementation(async function () {
        Object.assign(capturedRequest, this);
        return this;
      });

      // Act
      await BookingRequestController.createBookingRequest(mockReq, mockRes);

      // Assert
      expect(capturedRequest.startDate).toEqual(new Date(testDate));
      expect(capturedRequest.dob).toEqual(new Date(testDate));
    });
  });
});
