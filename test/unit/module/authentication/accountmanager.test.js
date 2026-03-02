/**
 * accountmanager.test.js - UNIT TEST CHO CHỨC NĂNG TẠO TÀI KHOẢN QUẢN LÝ / KẾ TOÁN
 *
 * Tập trung test middleware `validateCreateManager` (BE cho popup "Tạo tài khoản Quản lý / Kế toán").
 */

const {
  validateCreateManager,
} = require("../../../../src/modules/account-management/validators/account.validator");

// Helper tạo req/res/next giả cho middleware
const createMockReqRes = (body = {}) => {
  const req = { body };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
};

describe("validateCreateManager middleware", () => {
  test("returns 400 when any required field is missing", () => {
    const { req, res, next } = createMockReqRes({
      // thiếu password và role
      username: "Phamvanung367",
      phoneNumber: "0901234567",
      email: "phamvanung@example.com",
    });

    validateCreateManager(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Username, phone number, email, password và role là bắt buộc",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username is invalid (too short)", () => {
    const { req, res, next } = createMockReqRes({
      username: "ab", // < 3 ký tự
      phoneNumber: "0901234567",
      email: "manager@example.com",
      password: "Password1",
      role: "manager",
    });

    validateCreateManager(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Username must be at least 3 characters long",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when email is invalid", () => {
    const { req, res, next } = createMockReqRes({
      username: "Phamvanung367",
      phoneNumber: "0901234567",
      email: "not-an-email",
      password: "Password1",
      role: "manager",
    });

    validateCreateManager(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Email không đúng định dạng",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when password is too short", () => {
    const { req, res, next } = createMockReqRes({
      username: "Phamvanung367",
      phoneNumber: "0901234567",
      email: "manager@example.com",
      password: "123", // < 6 ký tự
      role: "manager",
    });

    validateCreateManager(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Password must be at least 6 characters long",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when role is invalid", () => {
    const { req, res, next } = createMockReqRes({
      username: "Phamvanung367",
      phoneNumber: "0901234567",
      email: "manager@example.com",
      password: "Password1",
      role: "admin", // không thuộc ['manager', 'accountant']
    });

    validateCreateManager(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Role phải là manager hoặc accountant",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next when all fields are valid for manager role", () => {
    const { req, res, next } = createMockReqRes({
      username: "Phamvanung367",
      phoneNumber: "0901234567",
      email: "manager@example.com",
      password: "Password1",
      role: "manager",
    });

    validateCreateManager(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("calls next when all fields are valid for accountant role", () => {
    const { req, res, next } = createMockReqRes({
      username: "Phamvanung368",
      phoneNumber: "0907654321",
      email: "accountant@example.com",
      password: "Password2",
      role: "accountant",
    });

    validateCreateManager(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

