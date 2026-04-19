/**
 * Unit test input for forgot password
 *
 * Test middleware `validateForgotPassword` với 4 test case:
 * 1. Email missing (null)
 * 2. Email format invalid
 * 3. Email valid
 * 4. Email không hợp lệ (không có @)
 */

const {
  validateForgotPassword,
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

describe("validateForgotPassword middleware", () => {
  test("returns 400 when email is missing (utc001)", () => {
    const { req, res, next } = createMockReqRes({});

    validateForgotPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập địa chỉ email",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when email format is invalid - no @ (utc002)", () => {
    const { req, res, next } = createMockReqRes({ email: "caovantruong005gmail.com" });

    validateForgotPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập địa chỉ email hợp lệ",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when email format is invalid (utc003)", () => {
    const { req, res, next } = createMockReqRes({ email: "caovantruong2503@gmail.com" });

    validateForgotPassword(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("returns 400 when email format is invalid (utc004)", () => {
    const { req, res, next } = createMockReqRes({ email: "caovantruong2503@gmail" });

    validateForgotPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng nhập địa chỉ email hợp lệ",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
