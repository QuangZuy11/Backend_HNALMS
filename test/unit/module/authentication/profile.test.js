/**
 * profile.test.js - UNIT TEST CHO CHỨC NĂNG CẬP NHẬT THÔNG TIN CÁ NHÂN
 *
 * - Test middleware `validateUpdateProfile`
 * - Test service `updateProfile`
 */

// ────────────────────────────────────────────────────────────────────────────────
// 1. UNIT TEST CHO validateUpdateProfile (middleware)
// ────────────────────────────────────────────────────────────────────────────────

const {
  validateUpdateProfile,
} = require("../../../../src/modules/authentication/validators/auth.validator");

const createMockReqRes = (body = {}) => {
  const req = { body };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
};

describe("validateUpdateProfile middleware", () => {
  test("returns 400 when fullname is shorter than 2 characters", () => {
    const { req, res, next } = createMockReqRes({ fullname: "A" });

    validateUpdateProfile(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Họ và tên phải có ít nhất 2 ký tự",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when cccd is shorter than 9 characters", () => {
    const { req, res, next } = createMockReqRes({ cccd: "12345678" });

    validateUpdateProfile(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "CCCD/CMND không hợp lệ",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when gender is invalid", () => {
    const { req, res, next } = createMockReqRes({ gender: "Unknown" });

    validateUpdateProfile(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Giới tính không hợp lệ. Phải là: Male, Female, hoặc Other",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when dob is invalid date", () => {
    const { req, res, next } = createMockReqRes({ dob: "invalid-date" });

    validateUpdateProfile(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Ngày sinh không hợp lệ",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next when all provided fields are valid or empty", () => {
    const { req, res, next } = createMockReqRes({
      fullname: "Đoàn Xuân Tuấn",
      cccd: "0123456789",
      address: "Hà Nội",
      dob: "2000-01-01",
      gender: "Male",
    });

    validateUpdateProfile(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 2. UNIT TEST CHO updateProfile (service)
// ────────────────────────────────────────────────────────────────────────────────

jest.mock("../../../../src/modules/authentication/models/user.model");
jest.mock("../../../../src/modules/authentication/models/userInfor.model", () => {
  const UserInfoMock = jest.fn().mockImplementation((data) => ({
    ...data,
    save: jest.fn().mockResolvedValue(true),
  }));

  UserInfoMock.findOne = jest.fn();

  return UserInfoMock;
});

const User = require("../../../../src/modules/authentication/models/user.model");
const UserInfo = require("../../../../src/modules/authentication/models/userInfor.model");
const authServiceModule = require("../../../../src/modules/authentication/services/auth.service");
const authController = require("../../../../src/modules/authentication/controllers/auth.controller");
const { updateProfile } = authServiceModule;

describe("updateProfile service (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("throws error when user is not found", async () => {
    User.findById.mockResolvedValue(null);

    await expect(
      updateProfile("non-existing-id", { fullname: "Test" })
    ).rejects.toThrow("User not found");

    expect(User.findById).toHaveBeenCalledWith("non-existing-id");
    expect(UserInfo.findOne).not.toHaveBeenCalled();
  });

  test("creates new UserInfo when it does not exist", async () => {
    const mockUser = {
      _id: "user-id",
      username: "user1",
      email: "user1@test.com",
      phoneNumber: "0901234567",
      role: "Tenant",
      status: "active",
      createdAt: new Date("2024-01-01"),
    };

    User.findById.mockResolvedValue(mockUser);
    UserInfo.findOne.mockResolvedValue(null);

    const profileData = {
      fullname: "Đoàn Xuân Tuấn",
      cccd: "0123456789",
      address: "Hà Nội",
      dob: new Date("2000-01-01"),
      gender: "Male",
      // các field null/undefined sẽ bị bỏ qua
      otherField: null,
    };

    const result = await updateProfile("user-id", profileData);

    // new UserInfo(...) đã được gọi với userId + filteredData
    expect(UserInfo).toHaveBeenCalledWith({
      userId: mockUser._id,
      fullname: "Đoàn Xuân Tuấn",
      cccd: "0123456789",
      address: "Hà Nội",
      dob: profileData.dob,
      gender: "Male",
    });

    // Kết quả trả về đã merge thông tin từ User và UserInfo
    expect(result._id).toBe("user-id");
    expect(result.username).toBe("user1");
    expect(result.email).toBe("user1@test.com");
    expect(result.fullname).toBe("Đoàn Xuân Tuấn");
    expect(result.address).toBe("Hà Nội");
    expect(result.gender).toBe("Male");
  });

  test("updates existing UserInfo when it already exists", async () => {
    const mockUser = {
      _id: "user-id",
      username: "user1",
      email: "user1@test.com",
      phoneNumber: "0901234567",
      role: "Tenant",
      status: "active",
      createdAt: new Date("2024-01-01"),
    };

    const existingUserInfo = {
      userId: "user-id",
      fullname: "Old Name",
      address: "Old Address",
      save: jest.fn().mockResolvedValue(true),
    };

    User.findById.mockResolvedValue(mockUser);
    UserInfo.findOne.mockResolvedValue(existingUserInfo);

    const profileData = {
      fullname: "New Name",
      address: "New Address",
    };

    const result = await updateProfile("user-id", profileData);

    expect(existingUserInfo.fullname).toBe("New Name");
    expect(existingUserInfo.address).toBe("New Address");
    expect(existingUserInfo.save).toHaveBeenCalled();

    expect(result.fullname).toBe("New Name");
    expect(result.address).toBe("New Address");
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 3. UNIT TEST CHO auth.controller.updateProfile (controller)
// ────────────────────────────────────────────────────────────────────────────────

describe("auth.controller.updateProfile", () => {
  let res;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  test("returns 401 when userId is missing in req.user", async () => {
    const req = { user: null, body: {} };

    await authController.updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Unauthorized - User ID not found",
    });
  });

  test("returns 400 when all updatable fields are empty", async () => {
    const req = {
      user: { userId: "user-id" },
      body: { fullname: "", cccd: "", address: "", dob: "", gender: "" },
    };

    await authController.updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "At least one field is required",
    });
  });

  test("returns 200 and data when updateProfile succeeds", async () => {
    const req = {
      user: { userId: "user-id" },
      body: {
        fullname: "New Name",
        cccd: "0123456789",
        address: "HN",
        dob: "2000-01-01",
        gender: "Male",
      },
    };

    const updatedProfile = {
      _id: "user-id",
      username: "user1",
      email: "user1@test.com",
      phoneNumber: "0901234567",
      role: "Tenant",
      status: "active",
      createdAt: new Date("2024-01-01"),
      fullname: "New Name",
      cccd: "0123456789",
      address: "HN",
      dob: new Date("2000-01-01"),
      gender: "Male",
    };

    const updateProfileSpy = jest
      .spyOn(authServiceModule, "updateProfile")
      .mockResolvedValue(updatedProfile);

    await authController.updateProfile(req, res);

    expect(updateProfileSpy).toHaveBeenCalledWith("user-id", {
      fullname: "New Name",
      cccd: "0123456789",
      address: "HN",
      dob: new Date("2000-01-01"),
      gender: "Male",
    });

    expect(res.status).not.toHaveBeenCalled(); // dùng status mặc định 200
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Cập nhật thông tin thành công",
      data: {
        ...updatedProfile,
        _id: "user-id",
      },
    });
  });

  test("returns 404 when service throws 'not found' error", async () => {
    const req = {
      user: { userId: "user-id" },
      body: { fullname: "Test" },
    };

    jest
      .spyOn(authServiceModule, "updateProfile")
      .mockRejectedValue(new Error("User not found"));

    await authController.updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "User not found",
    });
  });

  test("returns 400 when service throws 'validation' error", async () => {
    const req = {
      user: { userId: "user-id" },
      body: { fullname: "Test" },
    };

    jest
      .spyOn(authServiceModule, "updateProfile")
      .mockRejectedValue(new Error("validation error: invalid data"));

    await authController.updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "validation error: invalid data",
    });
  });

  test("returns 500 when service throws unexpected error", async () => {
    const req = {
      user: { userId: "user-id" },
      body: { fullname: "Test" },
    };

    jest
      .spyOn(authServiceModule, "updateProfile")
      .mockRejectedValue(new Error("Some other error"));

    await authController.updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Server error",
    });
  });
});
