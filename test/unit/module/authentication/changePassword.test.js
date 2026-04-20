/**
 * Unit test input for change password
 *
 * Test middleware `validateChangePassword` với 5 test case:
 * 1. Valid oldPassword & newPassword (Normal)
 * 2. oldPassword == newPassword (Abnormal)
 * 3. oldPassword missing (Abnormal)
 * 4. newPassword missing (Abnormal)
 * 5. newPassword too short (Abnormal)
 */

const {
  validateChangePassword,
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

describe("validateChangePassword middleware", () => {
  test("calls next when oldPassword and newPassword are valid (utc001)", () => {
    const { req, res, next } = createMockReqRes({
      oldPassword: "111111",
      newPassword: "123456",
    });

    validateChangePassword(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("returns 400 when newPassword is same as oldPassword (utc002)", () => {
    const { req, res, next } = createMockReqRes({
      oldPassword: "111111",
      newPassword: "111111",
    });

    validateChangePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Mật khẩu mới phải khác mật khẩu cũ",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when oldPassword is missing (utc003)", () => {
    const { req, res, next } = createMockReqRes({
      newPassword: "123456",
    });

    validateChangePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Nhập đầy đủ mật khẩu cũ và mật khẩu mới",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when newPassword is missing (utc004)", () => {
    const { req, res, next } = createMockReqRes({
      oldPassword: "111111",
    });

    validateChangePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Nhập đầy đủ mật khẩu cũ và mật khẩu mới",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when newPassword is too short (utc005)", () => {
    const { req, res, next } = createMockReqRes({
      oldPassword: "111111",
      newPassword: "12",
    });

    validateChangePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Mật khẩu phải có ít nhất 6 ký tự",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
