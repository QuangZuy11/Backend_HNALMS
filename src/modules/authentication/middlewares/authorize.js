/**
 * Middleware phân quyền - Kiểm tra vai trò người dùng
 * Đảm bảo người dùng có quyền truy cập tính năng
 */
const { errorResponse } = require("../../../shared/utils/response");

/**
 * Kiểm tra vai trò của người dùng
 * @param {Array} roles - Danh sách các vai trò được phép (ví dụ: ['admin', 'manager'])
 * @returns {Function} Middleware function
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    try {
      // Kiểm tra xem người dùng đã đăng nhập chưa (do authenticate middleware set)
      if (!req.user) {
        return errorResponse(res, "User not authenticated", 401);
      }

      // Chuyển đổi role thành mảng nếu chỉ truyền vào 1 giá trị
      const allowedRoles = Array.isArray(roles) ? roles : [roles];

      // Kiểm tra vai trò của người dùng có trong danh sách cho phép không
      if (!allowedRoles.includes(req.user.role)) {
        return errorResponse(
          res,
          `Access denied. Required role: ${allowedRoles.join(" or ")}`,
          403,
        );
      }

      next();
    } catch (error) {
      return errorResponse(res, "Authorization failed", 403);
    }
  };
};

module.exports = { authorize };
