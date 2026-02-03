const { verifyToken } = require("../../../shared/config/jwt");
const User = require("../models/user.model");


const authenticate = async (req, res, next) => {
  try {
   
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided. Please login to access this resource",
      });
    }

    // 2. Tách token (bỏ "Bearer " prefix)
    const token = authHeader.substring(7);

    // 3. Verify token bằng JWT
    const decoded = verifyToken(token);
    console.log("🔍 Auth Middleware - Decoded token:", {
      userId: decoded.userId,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp,
    });

    let user = null;
    const mongoose = require("mongoose");

    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token: missing userId",
      });
    }

    const searchUserId = String(decoded.userId).trim();
    console.log(
      "🔍 Auth Middleware - Searching for user with userId:",
      searchUserId,
    );

 
    user = await User.findOne({ user_id: searchUserId }).select("-password");
    console.log(
      "🔍 Auth Middleware - Strategy 1 (user_id field) result:",
      user ? "FOUND" : "NOT FOUND",
    );


    if (!user) {
      console.log("🔍 Auth Middleware - Trying Strategy 2 (_id field)...");
      try {
        if (mongoose.Types.ObjectId.isValid(searchUserId)) {
          // Thử tìm bằng findById
          user = await User.findById(searchUserId).select("-password");
          console.log(
            "🔍 Auth Middleware - Strategy 2a (findById) result:",
            user ? "FOUND" : "NOT FOUND",
          );

          // Nếu không tìm thấy, thử tìm bằng findOne với _id
          if (!user) {
            user = await User.findOne({
              _id: new mongoose.Types.ObjectId(searchUserId),
            }).select("-password");
            console.log(
              "🔍 Auth Middleware - Strategy 2b (findOne with ObjectId) result:",
              user ? "FOUND" : "NOT FOUND",
            );
          }

          if (!user) {
            const allUsers = await User.find({}).select("-password");
            console.log(
              "🔍 Auth Middleware - Strategy 2c: Checking all users manually. Total users:",
              allUsers.length,
            );
            user = allUsers.find((u) => {
              const userIdStr = String(u._id);
              const userIdHex = u._id.toString();
              return userIdStr === searchUserId || userIdHex === searchUserId;
            });
            console.log(
              "🔍 Auth Middleware - Strategy 2c result:",
              user ? "FOUND" : "NOT FOUND",
            );
          }

          // Đảm bảo user có user_id (nếu chưa có thì tạo)
          if (user && !user.user_id) {
            user.user_id = new mongoose.Types.ObjectId().toString();
            await user.save();
          }
        }
      } catch (err) {
        console.error(
          "Auth middleware - Error trying to find user by _id:",
          err,
        );
      }
    }

  
    if (!user) {
      console.log(
        "🔍 Auth Middleware - Trying Strategy 3 (fallback search)...",
      );
      try {
        const allUsers = await User.find({}).select("-password");
        console.log(
          "🔍 Auth Middleware - Total users in database:",
          allUsers.length,
        );

        // Log để debug
        if (allUsers.length > 0) {
          console.log("🔍 Auth Middleware - Sample user structure:", {
            _id: allUsers[0]._id,
            user_id: allUsers[0].user_id,
            email: allUsers[0].email,
            role: allUsers[0].role,
          });
        }

       
        user = allUsers.find((u) => {
          const matchById = u._id && String(u._id.toString()) === searchUserId;
          const matchByUserId = u.user_id && String(u.user_id) === searchUserId;
          if (matchById || matchByUserId) {
            console.log("🔍 Auth Middleware - Match found! User:", {
              _id: u._id,
              user_id: u.user_id,
              email: u.email,
              matchById,
              matchByUserId,
            });
          }
          return matchById || matchByUserId;
        });

    
        if (user && !user.user_id) {
          user.user_id = new mongoose.Types.ObjectId().toString();
          await user.save();
        }
      } catch (err) {
        console.error("Auth middleware - Error in fallback user search:", err);
      }
    }

    if (!user) {
      console.log("❌ Auth Middleware - User NOT FOUND after all strategies");
      console.log("❌ Auth Middleware - Debug info:", {
        searchUserId,
        decodedUserId: decoded.userId,
        decodedRole: decoded.role,
      });
      return res.status(401).json({
        success: false,
        message: "User not found. Token is invalid",
      });
    }

    console.log("✅ Auth Middleware - User found successfully:", {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
    });

    // 5. Kiểm tra trạng thái tài khoản (status field)
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Account is not active. Please contact administrator",
      });
    }

    req.user = {
      userId: user._id,
      role: user.role,
      email: user.email,
      username: user.username,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    // Xử lý lỗi token
    if (error.message.includes("token")) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token. Please login again",
      });
    }

    // Lỗi server
    res.status(500).json({
      success: false,
      message: "Authentication failed. Server error",
    });
  }
};


const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Không có token -> cho phép tiếp tục
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    const user = await User.findOne({ user_id: decoded.userId }).select(
      "-password",
    );

    // Chỉ gắn user nếu tìm thấy và active
    if (user && user.isactive) {
      req.user = {
        userId: user.user_id,
        role: user.role,
        email: user.email,
      };
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth,
};
