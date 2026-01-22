// Routes: POST /register, /login, /logout, /forgot-password, /change-password
const  express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

// Register route - Đăng ký tài khoản mới
router.post("/register", authController.register);

// Login route - Đăng nhập
router.post("/login", authController.login);

module.exports = router;