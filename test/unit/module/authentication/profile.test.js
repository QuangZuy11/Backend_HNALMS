/**
 * profile.test.js - UNIT TEST INPUT cho cập nhật thông tin cá nhân
 *
 * Chỉ test middleware `validateUpdateProfile`
 */

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
