

/**
 * Tạo middleware authorize với các role được phép
 * @param {...string} allowedRoles - Danh sách các role được phép truy cập
 * @returns {Function} Express middleware
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // 1. Kiểm tra xem đã authenticate chưa
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first"
      });
    }

    // 2. Kiểm tra role của user có trong danh sách allowedRoles không
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This resource requires one of these roles: ${allowedRoles.join(', ')}`,
        requiredRoles: allowedRoles,
        yourRole: req.user.role
      });
    }

    // 3. User có quyền -> cho phép tiếp tục
    next();
  };
};

/**
 * Middleware kiểm tra user có phải là admin không
 * Shortcut cho authorize('admin')
 */
const isAdmin = authorize('admin');

/**
 * Middleware kiểm tra user có phải là manager hoặc admin không
 * Shortcut cho authorize('admin', 'manager')
 */
const isManagerOrAdmin = authorize('admin', 'manager');

/**
 * Middleware kiểm tra user có phải là owner hoặc admin không
 * Shortcut cho authorize('admin', 'owner')
 */
const isOwnerOrAdmin = authorize('admin', 'owner');

/**
 * Middleware kiểm tra user có phải là Tenant không
 * Shortcut cho authorize('Tenant')
 */
const isTenant = authorize('Tenant');

/**
 * Ma trận quyền tạo tài khoản:
 * - Admin -> Owner
 * - Owner -> Manager, Accountant
 * - Manager -> Tenant
 */
const ALLOWED_CREATE_ROLES = {
  admin: ['owner'],
  owner: ['manager', 'accountant'],
  manager: ['Tenant']
};

/**
 * Middleware kiểm tra user có quyền tạo tài khoản với role được chỉ định
 * Đặt sau authenticate, trước controller
 * req.body.role phải chứa role cần tạo
 */
const canCreateAccount = (req, res, next) => {
  const creatorRole = req.user?.role;
  const targetRole = req.body?.role;

  if (!creatorRole) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized. Please login first"
    });
  }

  if (!targetRole) {
    return res.status(400).json({
      success: false,
      message: "Role is required"
    });
  }

  const allowedRoles = ALLOWED_CREATE_ROLES[creatorRole];
  if (!allowedRoles || !allowedRoles.includes(targetRole)) {
    return res.status(403).json({
      success: false,
      message: `Bạn không có quyền tạo tài khoản với role "${targetRole}". Role của bạn (${creatorRole}) chỉ được tạo: ${allowedRoles ? allowedRoles.join(', ') : 'không có'}`,
      creatorRole,
      targetRole
    });
  }

  next();
};

/**
 * Middleware kiểm tra user có quyền truy cập resource của chính họ
 * Ví dụ: user chỉ có thể xem/sửa profile của chính họ
 * Admin có thể truy cập tất cả
 * 
 * Usage:
 * router.get('/users/:userId/profile', authenticate, isOwnerOrAdmin, controller.getProfile);
 * 
 * @param {string} paramName - Tên parameter trong req.params chứa userId (default: 'userId')
 */
const isResourceOwner = (paramName = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first"
      });
    }

    const resourceUserId = req.params[paramName];
    
    // Admin có thể truy cập tất cả
    if (req.user.role === 'admin') {
      return next();
    }

    // User chỉ có thể truy cập resource của chính họ
    if (req.user.userId.toString() !== resourceUserId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only access your own resources"
      });
    }

    next();
  };
};

module.exports = {
  authorize,
  isAdmin,
  isManagerOrAdmin,
  isOwnerOrAdmin,
  isTenant,
  isResourceOwner,
  canCreateAccount
};
