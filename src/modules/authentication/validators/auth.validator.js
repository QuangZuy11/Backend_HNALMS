/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, message: string }
 */
const validatePassword = (password) => {
  if (!password || password.length < 6) {
    return {
      valid: false,
      message: "Mật khẩu phải có ít nhất 6 ký tự"
    };
  }


  return { valid: true };
};

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {Object} { valid: boolean, message: string }
 */
const validateUsername = (username) => {
  if (!username || username.length < 3) {
    return {
      valid: false,
      message: "Tên đăng nhập phải có ít nhất 3 ký tự"
    };
  }

  if (username.length > 30) {
    return {
      valid: false,
      message: "Tên đăng nhập không được vượt quá 30 ký tự"
    };
  }

  // Only allow alphanumeric and underscore
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return {
      valid: false,
      message: "Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới"
    };
  }

  // Require both letters and numbers
  if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(username)) {
    return {
      valid: false,
      message: "Tên đăng nhập phải bao gồm cả chữ và số"
    };
  }

  return { valid: true };
};

/**
 * Middleware to validate registration input
 */
const validateRegister = (req, res, next) => {
  const { username, phoneNumber, email, password, role } = req.body || {};

  // Check required fields (client gửi field "password", không phải passwordHash)
  if (!username || !phoneNumber || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Username, phone number, email and password are required"
    });
  }

  // Validate username
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return res.status(400).json({
      success: false,
      message: usernameValidation.message
    });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "Email không đúng định dạng"
    });
  }

  // Validate password (plain password từ client)
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      success: false,
      message: passwordValidation.message
    });
  }

  // Validate role if provided
  if (role && !["admin", "manager", "owner", "Tenant", "accountant"].includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Invalid role. Must be one of: admin, manager, owner, Tenant, accountant"
    });
  }

  next();
};

/**
 * Middleware to validate login input
 */
const validateLogin = (req, res, next) => {
  const { username, password } = req.body || {};

  // Trường hợp client gửi sai kiểu dữ liệu cho username (không phải string)
  // => xem như thông tin đăng nhập sai để tránh lộ chi tiết validate
  if (username !== undefined && username !== null && typeof username !== "string") {
    return res.status(400).json({
      success: false,
      message: "Tên đăng nhập hoặc mật khẩu sai"
    });
  }

  const rawUsername = typeof username === "string" ? username : "";
  const rawPassword = typeof password === "string" ? password : "";

  // Không cho phép khoảng trắng ở đầu/cuối username
  if (rawUsername && rawUsername !== rawUsername.trim()) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập đúng tên đăng nhập"
    });
  }

  // Không cho phép khoảng trắng ở đầu/cuối password
  if (rawPassword && rawPassword !== rawPassword.trim()) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập đúng mật khẩu"
    });
  }

  const normalizedUsername = rawUsername.trim();
  const normalizedPassword = rawPassword.trim();

  // Thiếu cả hai
  if (!normalizedUsername && !normalizedPassword) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập tên đăng nhập và mật khẩu"
    });
  }

  // Thiếu username
  if (!normalizedUsername) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập tên đăng nhập"
    });
  }

  // Thiếu password
  if (!normalizedPassword) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập mật khẩu"
    });
  }

  // Username quá 30 ký tự
  if (normalizedUsername.length > 30) {
    return res.status(400).json({
      success: false,
      message: "Tên người dùng không được vượt quá 30 ký tự"
    });
  }

  // Username có khoảng trắng ở giữa hoặc ký tự không hợp lệ
  if (!/^[A-Za-z0-9._-]+$/.test(normalizedUsername)) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập đúng tên đăng nhập"
    });
  }

  // Ghi đè lại body bằng giá trị đã chuẩn hoá để BE xử lý thống nhất
  req.body.username = normalizedUsername;
  req.body.password = normalizedPassword;

  next();
};

/**
 * Middleware to validate change password input
 */
const validateChangePassword = (req, res, next) => {
  const { oldPassword, newPassword } = req.body || {};

  // Check required fields
  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Old password and new password are required"
    });
  }

  // Validate new password
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      success: false,
      message: passwordValidation.message
    });
  }

  // Check if new password is different from old password
  if (oldPassword === newPassword) {
    return res.status(400).json({
      success: false,
      message: "New password must be different from old password"
    });
  }

  next();
};

/**
 * Middleware to validate forgot password input
 */
const validateForgotPassword = (req, res, next) => {
  const { email } = req.body || {};

  // Check required field
  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập địa chỉ email"
    });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập địa chỉ email hợp lệ"
    });
  }
  
  next();
};


const validateUpdateProfile = (req, res, next) => {
  const { fullname, cccd, address, dob, gender } = req.body || {};

  
  if (fullname !== undefined && fullname !== null && fullname.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: "Họ và tên phải có ít nhất 2 ký tự"
    });
  }

 
  if (cccd !== undefined && cccd !== null && cccd.trim().length < 9) {
    return res.status(400).json({
      success: false,
      message: "CCCD/CMND không hợp lệ"
    });
  }

 
  if (gender !== undefined && gender !== null && !["Male", "Female", "Other"].includes(gender)) {
    return res.status(400).json({
      success: false,
      message: "Giới tính không hợp lệ. Phải là: Male, Female, hoặc Other"
    });
  }

  
  if (dob !== undefined && dob !== null) {
    const date = new Date(dob);
    if (isNaN(date.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Ngày sinh không hợp lệ"
      });
    }
  }

  next();
};


const validateCreateAccount = (req, res, next) => {
  const { username, phoneNumber, email, password, role } = req.body || {};

  if (!username || !phoneNumber || !email || !password || !role) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập tên đăng nhập, số điện thoại, email, mật khẩu và vai trò"
    });
  }

  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return res.status(400).json({
      success: false,
      message: usernameValidation.message
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "Email không đúng định dạng"
    });
  }

  if (!/^0\d+$/.test(phoneNumber)) {
    return res.status(400).json({
      success: false,
      message: "Số điện thoại phải bắt đầu bằng số 0"
    });
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      success: false,
      message: passwordValidation.message
    });
  }

  const allowedRoles = ["manager", "accountant"];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Vai trò không hợp lệ. Owner chỉ được tạo tài khoản cho manager hoặc accountant"
    });
  }

  next();
};

module.exports = {
  isValidEmail,
  validatePassword,
  validateUsername,
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateForgotPassword,
  validateUpdateProfile,
  validateCreateAccount
};
