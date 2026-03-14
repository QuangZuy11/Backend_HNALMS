/**
 * Unit test input for admin creating owner account
 *
 * Chỉ test middleware `validateCreateOwner`
 */

const {
  validateCreateOwner,
} = require("../../../../src/modules/account-management/validators/account.validator");

const createMockReqRes = (body = {}) => {
  const req = { body };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
};

describe("validateCreateOwner middleware", () => {
  test("returns 400 when required fields are missing", () => {
    const { req, res, next } = createMockReqRes({ username: "owner1" });

    validateCreateOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Username, phone number, email và password là bắt buộc",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username is too short", () => {
    const { req, res, next } = createMockReqRes({
      username: "ab",
      phoneNumber: "0901234567",
      email: "owner@example.com",
      password: "123456",
    });

    validateCreateOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên đăng nhập phải có ít nhất 3 ký tự",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username is too long", () => {
    const { req, res, next } = createMockReqRes({
      username: "a".repeat(31),
      phoneNumber: "0901234567",
      email: "owner@example.com",
      password: "123456",
    });

    validateCreateOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên đăng nhập không được vượt quá 30 ký tự",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username has invalid characters", () => {
    const { req, res, next } = createMockReqRes({
      username: "owner name",
      phoneNumber: "0901234567",
      email: "owner@example.com",
      password: "123456",
    });

    validateCreateOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username does not include both letters and numbers", () => {
    const { req, res, next } = createMockReqRes({
      username: "ownername",
      phoneNumber: "0901234567",
      email: "owner@example.com",
      password: "123456",
    });

    validateCreateOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên đăng nhập phải bao gồm cả chữ và số",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when email is invalid", () => {
    const { req, res, next } = createMockReqRes({
      username: "owner01",
      phoneNumber: "0901234567",
      email: "invalid-email",
      password: "123456",
    });

    validateCreateOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Email không đúng định dạng",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when password is too short", () => {
    const { req, res, next } = createMockReqRes({
      username: "owner01",
      phoneNumber: "0901234567",
      email: "owner@example.com",
      password: "123",
    });

    validateCreateOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Mật khẩu phải có ít nhất 6 ký tự",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next when input is valid", () => {
    const { req, res, next } = createMockReqRes({
      username: "owner01",
      phoneNumber: "0901234567",
      email: "owner01@example.com",
      password: "123456",
    });

    validateCreateOwner(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
