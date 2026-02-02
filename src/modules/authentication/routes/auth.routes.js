const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate, canCreateAccount, authorize } = require("../middlewares");
const { validateRegister, validateLogin, validateChangePassword, validateForgotPassword, validateUpdateProfile, validateCreateAccount } = require("../validators/auth.validator");

// Public routes (không cần authentication)
// Register route - Đăng ký tài khoản mới
router.post("/register", validateRegister, authController.register);

// Protected route - Tạo tài khoản theo role (Admin/Owner)
// Admin -> Owner | Owner -> Manager, Accountant
router.post("/create-account", authenticate, validateCreateAccount, canCreateAccount, authController.createAccount);

// Protected route - Danh sách tài khoản do user tạo
router.get("/created-accounts", authenticate, authorize("admin", "owner"), authController.getCreatedAccounts);

// Protected route - Xem chi tiết tài khoản do user tạo
router.get("/account/:accountId", authenticate, authorize("admin", "owner"), authController.getAccountDetail);

// Protected route - Đóng tài khoản (chỉ chuyển status, không xóa DB)
router.put("/disable-account/:accountId", authenticate, authorize("admin", "owner"), authController.disableAccount);

// Login route - Đăng nhập
router.post("/login", validateLogin, authController.login);

// Forgot password route - Quên mật khẩu
router.post("/forgot-password", validateForgotPassword, authController.forgotPassword);

// Protected routes (require authentication)
// Get current user profile
router.get("/me", authenticate, authController.getProfile);

// Update profile
router.put("/profile", authenticate, validateUpdateProfile, authController.updateProfile);

// Change password
router.post("/change-password", authenticate, validateChangePassword, authController.changePassword);

// Logout
router.post("/logout", authenticate, authController.logout);

module.exports = router;