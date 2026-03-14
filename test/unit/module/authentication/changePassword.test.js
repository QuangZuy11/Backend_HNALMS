/**
 * Unit test input for change password
 *
 * Chỉ test middleware `validateChangePassword`
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
  test("returns 400 when oldPassword is missing", () => {
    const { req, res, next } = createMockReqRes({ newPassword: "123456" });

    validateChangePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Old password and new password are required",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when newPassword is missing", () => {
    const { req, res, next } = createMockReqRes({ oldPassword: "123456" });

    validateChangePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Old password and new password are required",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when newPassword is too short", () => {
    const { req, res, next } = createMockReqRes({
      oldPassword: "123456",
      newPassword: "123",
    });

    validateChangePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Mật khẩu phải có ít nhất 6 ký tự",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when newPassword is same as oldPassword", () => {
    const { req, res, next } = createMockReqRes({
      oldPassword: "123456",
      newPassword: "123456",
    });

    validateChangePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "New password must be different from old password",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next when oldPassword and newPassword are valid", () => {
    const { req, res, next } = createMockReqRes({
      oldPassword: "123456",
      newPassword: "654321",
    });

    validateChangePassword(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
