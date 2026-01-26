/**
 * Middleware xác thực người dùng qua JWT token
 * Kiểm tra và giải mã token từ header Authorization
 */
const jwt = require("jsonwebtoken");
const { errorResponse } = require("../../../shared/utils/response");

/**
 * Xác thực JWT token
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 */
const authenticate = async (req, res, next) => {
  try {
    // Lấy token từ header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(res, "No token provided", 401);
    }

    const token = authHeader.split(" ")[1];

    // Xác thực và giải mã token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    );

    // Gắn thông tin người dùng vào request để sử dụng ở middleware tiếp theo
    req.user = decoded;

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return errorResponse(res, "Invalid token", 401);
    }
    if (error.name === "TokenExpiredError") {
      return errorResponse(res, "Token expired", 401);
    }
    return errorResponse(res, "Authentication failed", 401);
  }
};

module.exports = { authenticate };
