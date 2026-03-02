/**
 * login.test.js - UNIT TEST "ĐÚNG NGHĨA" CHO CHỨC NĂNG LOGIN
 *
 * - Test middleware `validateLogin` như 1 hàm thuần, mock req/res/next.
 * - Test service `loginUser` với mock model User, UserInfo, bcrypt, generateToken
 *   (không gọi HTTP, không kết nối DB thật).
 */

// ────────────────────────────────────────────────────────────────────────────────
// 1. UNIT TEST CHO validateLogin (middleware)
// ────────────────────────────────────────────────────────────────────────────────

const {
  validateLogin,
} = require("../../../../src/modules/authentication/validators/auth.validator");

// Helper tạo req/res/next giả
const createMockReqRes = (body = {}) => {
  const req = { body };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
};

describe("validateLogin middleware", () => {
  test("returns 400 when username is missing", () => {
    const { req, res, next } = createMockReqRes({ password: "111111" });

    validateLogin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập tên đăng nhập",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when password is missing", () => {
    const { req, res, next } = createMockReqRes({ username: "doanxuantuan367" });

    validateLogin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập mật khẩu",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username is longer than 30 chars", () => {
    const longUsername = "a".repeat(31);
    const { req, res, next } = createMockReqRes({
      username: longUsername,
      password: "111111",
    });

    validateLogin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên người dùng không được vượt quá 30 ký tự",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username has space or invalid chars", () => {
    const { req, res, next } = createMockReqRes({
      username: "doan xuan 367",
      password: "111111",
    });

    validateLogin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập đúng tên đăng nhập",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username has leading or trailing spaces", () => {
    const { req, res, next } = createMockReqRes({
      username: "   doanxuantuan367   ",
      password: "111111",
    });

    validateLogin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập đúng tên đăng nhập",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when password has leading or trailing spaces", () => {
    const { req, res, next } = createMockReqRes({
      username: "doanxuantuan367",
      password: "   111111   ",
    });

    validateLogin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập đúng mật khẩu",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username is not a string (invalid argument type)", () => {
    const { req, res, next } = createMockReqRes({
      // username là kiểu number -> validateLogin sẽ coi như rỗng
      username: 123456,
      password: "111111",
    });

    validateLogin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên đăng nhập hoặc mật khẩu sai",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next when username and password are valid (no extra spaces)", () => {
    const { req, res, next } = createMockReqRes({
      username: "doanxuantuan367",
      password: "111111",
    });

    validateLogin(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.username).toBe("doanxuantuan367");
    expect(req.body.password).toBe("111111");
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 2. UNIT TEST CHO loginUser (service) với mock model + bcrypt + jwt
// ────────────────────────────────────────────────────────────────────────────────

jest.mock("../../../../src/modules/authentication/models/user.model");
jest.mock("../../../../src/modules/authentication/models/userInfor.model");
jest.mock("bcryptjs");
jest.mock("../../../../src/shared/config/jwt", () => ({
  generateToken: jest.fn(() => "mock-token"),
}));

const bcrypt = require("bcryptjs");
const User = require("../../../../src/modules/authentication/models/user.model");
const UserInfo = require("../../../../src/modules/authentication/models/userInfor.model");
const { generateToken } = require("../../../../src/shared/config/jwt");
const {
  loginUser,
} = require("../../../../src/modules/authentication/services/auth.service");

describe("loginUser service (unit) - các trường hợp nhập sai / đúng tài khoản", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("throws error khi username không tồn tại (nhập sai tên tài khoản)", async () => {
    User.findOne.mockResolvedValue(null);

    await expect(loginUser("not_exists", "111111")).rejects.toThrow(
      "Tên đăng nhập hoặc mật khẩu không chính xác"
    );

    expect(User.findOne).toHaveBeenCalledWith({   username: "not_exists" });
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(generateToken).not.toHaveBeenCalled();
  });

  test("throws error when account is not active", async () => {
    const mockUser = {
      _id: "user-id",
      username: "doanxuantuan367",
      email: "user@test.com",
      phoneNumber: "0901234567",
      role: "Tenant",
      status: "inactive",
      password: "hashed",
    };

    User.findOne.mockResolvedValue(mockUser);

    await expect(loginUser("doanxuantuan367", "111111")).rejects.toThrow(
      "Tài khoản chưa được kích hoạt"
    );

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(generateToken).not.toHaveBeenCalled();
  });

  test("throws error when password is incorrect", async () => {
    const mockUser = {
      _id: "user-id",
      username: "doanxuantuan367",
      email: "user@test.com",
      phoneNumber: "0901234567",
      role: "Tenant",
      status: "active",
      password: "hashed-password",
    };

    User.findOne.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(false);

    await expect(loginUser("doanxuantuan367", "wrong")).rejects.toThrow(
      "Tên đăng nhập hoặc mật khẩu không chính xác"
    );

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "wrong",
      "hashed-password"
    );
    expect(generateToken).not.toHaveBeenCalled();
  });

  test("returns token and user data when login is successful", async () => {
    const mockUser = {
      _id: "user-id",
      username: "doanxuantuan367",
      email: "user@test.com",
      phoneNumber: "0901234567",
      role: "Tenant",
      status: "active",
      password: "hashed-password",
      createdAt: new Date("2024-01-01"),
    };

    const mockUserInfo = {
      fullname: "Người Dùng Test",
      cccd: "0123456789",
      address: "Hà Nội",
      dob: new Date("2000-01-01"),
      gender: "Male",
    };

    User.findOne.mockResolvedValue(mockUser);
    UserInfo.findOne.mockResolvedValue(mockUserInfo);
    bcrypt.compare.mockResolvedValue(true);

    const result = await loginUser("doanxuantuan367", "111111");

    expect(User.findOne).toHaveBeenCalledWith({ username: "doanxuantuan367" });
    expect(bcrypt.compare).toHaveBeenCalledWith(
      "111111",
      "hashed-password"
    );
    expect(generateToken).toHaveBeenCalledWith({
      userId: mockUser._id,
      role: mockUser.role,
    });

    expect(result.token).toBe("mock-token");
    expect(result.user.username).toBe("doanxuantuan367");
    expect(result.user.fullname).toBe("Người Dùng Test");
  });

  test("returns token and user data when UserInfo is not found (thông tin cá nhân chưa tạo)", async () => {
    const mockUser = {
      _id: "user-id-2",
      username: "doanxuantuan367",
      email: "user2@test.com",
      phoneNumber: "0907654321",
      role: "Tenant",
      status: "active",
      password: "hashed-password-2",
      createdAt: new Date("2024-02-01"),
    };

    User.findOne.mockResolvedValue(mockUser);
    // Không có bản ghi UserInfo
    UserInfo.findOne.mockResolvedValue(null);
    bcrypt.compare.mockResolvedValue(true);

    const result = await loginUser("doanxuantuan367", "111111");

    expect(result.token).toBe("mock-token");
    expect(result.user._id).toBe("user-id-2");
    expect(result.user.username).toBe("doanxuantuan367");
    expect(result.user.fullname).toBeNull();
    expect(result.user.address).toBeNull();
    expect(result.user.gender).toBeNull();
  });
});