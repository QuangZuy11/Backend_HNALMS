const authService = require("../services/auth.service");
const emailService = require("../../notification-management/services/email.service");
/**
 * Create Account - Tạo tài khoản theo role (Admin/Owner/Manager)
 * POST /api/auth/create-account
 * Admin -> Owner | Owner -> Manager, Accountant | Manager -> Tenant
 */
exports.createAccount = async (req, res) => {
  try {
    const { username, phoneNumber, email, password, role } = req.body;
    const createdBy = req.user?.userId;

    const user = await authService.createAccountByRole(
      { username, phoneNumber, email, password, role },
      createdBy
    );

    res.status(201).json({
      success: true,
      message: "Tạo tài khoản thành công",
      data: user
    });
  } catch (error) {
    console.error("Create account error:", error);

    if (error.message.includes("đã tồn tại")) {
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
 * Get Created Accounts - Danh sách tài khoản do user hiện tại tạo
 * GET /api/auth/created-accounts
 */
exports.getCreatedAccounts = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const accounts = await authService.getCreatedAccounts(userId);

    res.json({
      success: true,
      message: "Lấy danh sách tài khoản thành công",
      data: accounts,
      total: accounts.length
    });
  } catch (error) {
    console.error("Get created accounts error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/**
 * Get Account Detail - Xem chi tiết tài khoản do user tạo
 * GET /api/auth/account/:accountId
 */
exports.getAccountDetail = async (req, res) => {
  try {
    const { accountId } = req.params;
    const currentUserId = req.user?.userId;

    if (!currentUserId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const account = await authService.getCreatedAccountDetail(accountId, currentUserId);

    res.json({
      success: true,
      message: "Lấy chi tiết tài khoản thành công",
      data: account
    });
  } catch (error) {
    console.error("Get account detail error:", error);

    if (error.message.includes("không tồn tại")) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    if (error.message.includes("không có quyền")) {
      return res.status(403).json({
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
 * Disable Account - Đóng tài khoản (chuyển status sang inactive)
 * PUT /api/auth/disable-account/:accountId
 * Chỉ đóng được tài khoản do chính user tạo
 */
exports.disableAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const currentUserId = req.user?.userId;

    if (!currentUserId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const user = await authService.disableAccount(accountId, currentUserId);

    res.json({
      success: true,
      message: "Đã đóng tài khoản thành công",
      data: user
    });
  } catch (error) {
    console.error("Disable account error:", error);

    if (error.message.includes("không tồn tại")) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    if (error.message.includes("không có quyền") || error.message.includes("đã bị đóng")) {
      return res.status(403).json({
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
 * Register - Tạo tài khoản mới
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { username, phoneNumber, email, password, role } = req.body;

    // Call service to register user
    const result = await authService.registerUser({
      username,
      phoneNumber,
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
    const { username, password } = req.body;

    // Call service to login user
    const result = await authService.loginUser(username, password);

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
    // req.user.userId đã được set bởi authenticate middleware
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User ID not found"
      });
    }

    const profile = await authService.getUserProfile(userId);

    res.json({
      success: true,
      message: "Get profile successful",
      data: {
        ...profile,
        _id: userId
      }
    });
  } catch (error) {
    console.error("Get profile error:", error);
    
    if (error.message.includes("not found")) {
      return res.status(404).json({
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
 * Update current user profile
 * PUT /api/auth/profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User ID not found"
      });
    }

    const { fullname, cccd, address, dob, gender } = req.body;

    // Validate input
    if (!fullname && !cccd && !address && !dob && !gender) {
      return res.status(400).json({
        success: false,
        message: "At least one field is required"
      });
    }

    // Call service to update profile
    const updatedProfile = await authService.updateProfile(userId, {
      fullname,
      cccd,
      address,
      dob: dob ? new Date(dob) : null,
      gender
    });

    res.json({
      success: true,
      message: "Cập nhật thông tin thành công",
      data: {
        ...updatedProfile,
        _id: userId
      }
    });
  } catch (error) {
    console.error("Update profile error:", error);
    
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes("validation")) {
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
 * Change password
 * POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User ID not found"
      });
    }

    const { oldPassword, newPassword } = req.body;

    // Validate input
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Old password and new password are required"
      });
    }

    // Call service to change password
    await authService.changePassword(userId, oldPassword, newPassword);

    res.json({
      success: true,
      message: "Đổi mật khẩu thành công"
    });

  } catch (error) {
    console.error("Change password error:", error);

    if (error.message.includes("incorrect")) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu hiện tại không chính xác"
      });
    }

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(500).json({
      success: false,
      message: "Lỗi server"
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
      result.user.email,
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
