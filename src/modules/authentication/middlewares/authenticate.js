const { verifyToken } = require("../../../shared/config/jwt");
const User = require("../models/user.model");

/**
 * Middleware kiểm tra token hợp lệ
 * Xác thực JWT token từ header Authorization
 * Gắn thông tin user vào req.user nếu token hợp lệ
 * 
 * Usage:
 * router.get('/protected', authenticate, controller.method);
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Lấy token từ header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided. Please login to access this resource"
      });
    }

    // 2. Tách token (bỏ "Bearer " prefix)
    const token = authHeader.substring(7);

    // 3. Verify token bằng JWT
    const decoded = verifyToken(token);

    // 4. Kiểm tra user còn tồn tại trong database
    // IMPORTANT: Token có thể chứa _id (ObjectId) hoặc user_id (string)
    // Cần tìm user bằng cả hai cách
    let user = null;
    const mongoose = require("mongoose");
    
    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token: missing userId"
      });
    }
    
    const searchUserId = String(decoded.userId).trim();
    
    // Strategy 1: Tìm bằng user_id (string) - cho token mới
    user = await User.findOne({ user_id: searchUserId }).select("-password");
    
    // Strategy 2: Tìm bằng _id (ObjectId) - cho token cũ
    if (!user) {
      try {
        if (mongoose.Types.ObjectId.isValid(searchUserId)) {
          // Thử tìm bằng findById
          user = await User.findById(searchUserId).select("-password");
          
          // Nếu không tìm thấy, thử tìm bằng findOne với _id
          if (!user) {
            user = await User.findOne({ _id: new mongoose.Types.ObjectId(searchUserId) }).select("-password");
          }
          
          // Nếu vẫn không tìm thấy, tìm tất cả và so sánh thủ công
          if (!user) {
            const allUsers = await User.find({}).select("-password");
            user = allUsers.find(u => {
              const userIdStr = String(u._id);
              const userIdHex = u._id.toString();
              return userIdStr === searchUserId || userIdHex === searchUserId;
            });
          }
          
          // Đảm bảo user có user_id (nếu chưa có thì tạo)
          if (user && !user.user_id) {
            user.user_id = new mongoose.Types.ObjectId().toString();
            await user.save();
          }
        }
      } catch (err) {
        console.error("Auth middleware - Error trying to find user by _id:", err);
      }
    }
    
    // Strategy 3: Fallback - tìm tất cả users và match thủ công
    if (!user) {
      try {
        const allUsers = await User.find({}).select("-password");
        
        // Tìm user bằng cách so sánh _id.toString() hoặc user_id
        user = allUsers.find(u => {
          const matchById = u._id && String(u._id.toString()) === searchUserId;
          const matchByUserId = u.user_id && String(u.user_id) === searchUserId;
          return matchById || matchByUserId;
        });
        
        // Đảm bảo user có user_id
        if (user && !user.user_id) {
          user.user_id = new mongoose.Types.ObjectId().toString();
          await user.save();
        }
      } catch (err) {
        console.error("Auth middleware - Error in fallback user search:", err);
      }
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found. Token is invalid"
      });
    }

    // 5. Kiểm tra trạng thái tài khoản (ERD: isactive)
    if (!user.isactive) {
      return res.status(403).json({
        success: false,
        message: "Account is not active. Please contact administrator"
      });
    }

    // 6. Gắn thông tin user vào request để sử dụng ở các middleware/controller tiếp theo
    req.user = {
      userId: user.user_id,
      role: user.role,
      email: user.email
    };

    // 7. Cho phép request tiếp tục
    next();

  } catch (error) {
    console.error("Authentication error:", error);
    
    // Xử lý lỗi token
    if (error.message.includes("token")) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token. Please login again"
      });
    }

    // Lỗi server
    res.status(500).json({
      success: false,
      message: "Authentication failed. Server error"
    });
  }
};

/**
 * Optional authentication - không bắt buộc phải có token
 * Nếu có token hợp lệ thì gắn user vào req.user
 * Nếu không có token hoặc token không hợp lệ thì vẫn cho phép request tiếp tục
 * 
 * Usage:
 * router.get('/public', optionalAuth, controller.method);
 * // Trong controller có thể check: if (req.user) { ... }
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Không có token -> cho phép tiếp tục
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    const user = await User.findOne({ user_id: decoded.userId }).select("-password");
    
    // Chỉ gắn user nếu tìm thấy và active
    if (user && user.isactive) {
      req.user = {
        userId: user.user_id,
        role: user.role,
        email: user.email
      };
    }

    next();

  } catch (error) {
    // Có lỗi nhưng vẫn cho phép request tiếp tục (optional auth)
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth
};
