/**
 * Unit test input for create employee account (manager/accountant)
 *
 * Chỉ test middleware `validateCreateAccount`
 */

const {
  validateCreateAccount,
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

describe("validateCreateAccount middleware", () => {
  test("returns 400 when body is empty", () => {
    const { req, res, next } = createMockReqRes({});

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập tên đăng nhập, số điện thoại, email, mật khẩu và vai trò",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when required fields are missing", () => {
    const { req, res, next } = createMockReqRes({ username: "user1" });

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập tên đăng nhập, số điện thoại, email, mật khẩu và vai trò",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username is too short", () => {
    const { req, res, next } = createMockReqRes({
      username: "ab",
      phoneNumber: "0901234567",
      email: "test@example.com",
      password: "123456",
      role: "manager",
    });

    validateCreateAccount(req, res, next);

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
      email: "test@example.com",
      password: "123456",
      role: "manager",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên đăng nhập không được vượt quá 30 ký tự",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username has invalid characters", () => {
    const { req, res, next } = createMockReqRes({
      username: "user name",
      phoneNumber: "0901234567",
      email: "test@example.com",
      password: "123456",
      role: "manager",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when username does not include both letters and numbers", () => {
    const { req, res, next } = createMockReqRes({
      username: "username",
      phoneNumber: "0901234567",
      email: "test@example.com",
      password: "123456",
      role: "manager",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Tên đăng nhập phải bao gồm cả chữ và số",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when email is invalid", () => {
    const { req, res, next } = createMockReqRes({
      username: "user1",
      phoneNumber: "0901234567",
      email: "invalid-email",
      password: "123456",
      role: "manager",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Email không đúng định dạng",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when phoneNumber does not start with 0", () => {
    const { req, res, next } = createMockReqRes({
      username: "user1",
      phoneNumber: "9123456789",
      email: "test@example.com",
      password: "123456",
      role: "manager",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Số điện thoại phải bắt đầu bằng số 0",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when password is too short", () => {
    const { req, res, next } = createMockReqRes({
      username: "user1",
      phoneNumber: "0901234567",
      email: "test@example.com",
      password: "123",
      role: "manager",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Mật khẩu phải có ít nhất 6 ký tự",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when role is invalid", () => {
    const { req, res, next } = createMockReqRes({
      username: "user1",
      phoneNumber: "0901234567",
      email: "test@example.com",
      password: "123456",
      role: "tenant",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vai trò không hợp lệ. Owner chỉ được tạo tài khoản cho manager hoặc accountant",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next when input is valid for manager account", () => {
    const { req, res, next } = createMockReqRes({
      username: "manager01",
      phoneNumber: "0901234567",
      email: "manager01@example.com",
      password: "123456",
      role: "manager",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("calls next when input is valid for accountant account", () => {
    const { req, res, next } = createMockReqRes({
      username: "accountant01",
      phoneNumber: "0901234567",
      email: "accountant01@example.com",
      password: "123456",
      role: "accountant",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("returns 400 when role is owner", () => {
    const { req, res, next } = createMockReqRes({
      username: "owner01",
      phoneNumber: "0901234567",
      email: "owner01@example.com",
      password: "123456",
      role: "owner",
    });

    validateCreateAccount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vai trò không hợp lệ. Owner chỉ được tạo tài khoản cho manager hoặc accountant",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
