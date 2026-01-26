/**
 * Utility functions để chuẩn hóa các response trả về client
 * Giúp đồng nhất cấu trúc response trong toàn bộ API
 */

/**
 * Trả về response thành công
 * @param {Object} res - Express response object
 * @param {any} data - Dữ liệu cần trả về
 * @param {string} message - Thông báo thành công
 * @param {number} statusCode - Mã HTTP status (mặc định: 200)
 */
const successResponse = (
  res,
  data = null,
  message = "Success",
  statusCode = 200,
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Trả về response lỗi
 * @param {Object} res - Express response object
 * @param {string} message - Thông báo lỗi
 * @param {number} statusCode - Mã HTTP status (mặc định: 500)
 * @param {any} errorDetails - Chi tiết lỗi bổ sung
 */
const errorResponse = (
  res,
  message = "An error occurred",
  statusCode = 500,
  errorDetails = null,
) => {
  const response = {
    success: false,
    error: {
      status: statusCode,
      message,
    },
  };

  if (errorDetails) {
    response.error.details = errorDetails;
  }

  return res.status(statusCode).json(response);
};

/**
 * Trả về response lỗi validation
 * @param {Object} res - Express response object
 * @param {Array} errors - Danh sách các lỗi validation
 */
const validationErrorResponse = (res, errors = []) => {
  return res.status(400).json({
    success: false,
    error: {
      status: 400,
      message: "Validation failed",
      details: errors,
    },
  });
};

module.exports = {
  successResponse,
  errorResponse,
  validationErrorResponse,
};
