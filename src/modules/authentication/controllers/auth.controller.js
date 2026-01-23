const authService = require("../services/auth.service");
const emailService = require("../../notification-management/services/email.service");
/**
 * Register - Tạo tài khoản mới
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { username, fullname, email, password, role } = req.body;

    // Call service to register user
    const result = await authService.registerUser({
      username,
      fullname,
      email,
      password,
      role
    });

    // Response
    res.status(201).json({
      success: true,
      message: "Registration successful",
      token: result.token,
      user: result.user
    });

  } catch (error) {
    console.error("Register error:", error);

    // Handle specific errors
    if (error.message.includes("already exist")) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/**
 * Login - Đăng nhập
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Call service to login user
    const result = await authService.loginUser(email, password);

    // Response
    res.json({
      success: true,
      message: "Login successful",
      token: result.token,
      user: result.user
    });

  } catch (error) {
    console.error("Login error:", error);

    // Handle authentication errors (401)
    if (
      error.message.includes("incorrect") ||
      error.message.includes("not active") ||
      error.message.includes("Email")
    ) {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    // Server error (500)
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/**
 * Get current user profile
 * GET /api/auth/me
 */
exports.getProfile = async (req, res) => {
  try {
    // req.user is set by auth middleware
    const user = await authService.getUserById(req.user.userId);

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullname: user.fullname,
        role: user.role,
        avatarURL: user.avatarURL,
        status: user.status
      }
    });

  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/**
 * Change password
 * POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    // Call service to change password
    await authService.changePassword(req.user.userId, oldPassword, newPassword);

    res.json({
      success: true,
      message: "Password changed successfully"
    });

  } catch (error) {
    console.error("Change password error:", error);

    if (error.message.includes("incorrect")) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/**
 * Logout - Đăng xuất
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    // In JWT-based auth, logout is handled on client side by removing token
    // Here we can add token to blacklist if needed

    res.json({
      success: true,
      message: "Logout successful"
    });

  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/**
 * 
Forgot Password - Đặt lại mật khẩu
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Call service to reset password
    const result = await authService.forgotPassword(email);

    // Send email with new password
    await emailService.sendForgotPasswordEmail(
      result.user.email,
      result.user.fullname,
      result.newPassword
    );

    res.json({
      success: true,
      message: "Mật khẩu mới đã được gửi đến email của bạn"
    });

  } catch (error) {
    console.error("Forgot password error:", error);

    if (error.message.includes("not found") || error.message.includes("not active")) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes("send email")) {
      return res.status(500).json({
        success: false,
        message: "Không thể gửi email. Vui lòng thử lại sau"
      });
    }

    res.status(500).json({
      success: false,
      message: "Lỗi server"
    });
  }
};
