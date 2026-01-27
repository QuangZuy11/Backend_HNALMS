const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middlewares");
const { validateRegister, validateLogin, validateChangePassword, validateForgotPassword, validateUpdateProfile } = require("../validators/auth.validator");

// Public routes (không cần authentication)
// Register route - Đăng ký tài khoản mới
router.post("/register", validateRegister, authController.register);

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