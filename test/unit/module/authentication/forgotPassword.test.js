/**
 * Unit test input for forgot password
 *
 * Chỉ test middleware `validateForgotPassword`
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
  test("returns 400 when email is missing", () => {
    const { req, res, next } = createMockReqRes({});

    validateForgotPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Email is required",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 400 when email format is invalid", () => {
    const { req, res, next } = createMockReqRes({ email: "invalid-email" });

    validateForgotPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid email format",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next when email is valid", () => {
    const { req, res, next } = createMockReqRes({ email: "user@example.com" });

    validateForgotPassword(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
