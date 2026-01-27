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
      message: "Password must be at least 6 characters long"
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
      message: "Username must be at least 3 characters long"
    };
  }

  if (username.length > 30) {
    return {
      valid: false,
      message: "Username must not exceed 30 characters"
    };
  }

  // Only allow alphanumeric and underscore
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return {
      valid: false,
      message: "Username can only contain letters, numbers, and underscores"
    };
  }

  return { valid: true };
};

/**
 * Middleware to validate registration input
 */
const validateRegister = (req, res, next) => {
  const { email, password, role } = req.body;

  // Check required fields
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required"
    });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "Email không đúng định dạng"
    });
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      success: false,
      message: passwordValidation.message
    });
  }

  // Validate role if provided
  if (role && !["admin", "manager", "owner", "tenant", "accountant"].includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Invalid role. Must be one of: admin, manager, owner, tenant"
    });
  }

  next();
};

/**
 * Middleware to validate login input
 */
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  // Check required fields
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required"
    });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "Email không đúng định dạng"
    });
  }

  next();
};

/**
 * Middleware to validate change password input
 */
const validateChangePassword = (req, res, next) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

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

  // Check password confirmation if provided
  if (confirmPassword && newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "New password and confirmation do not match"
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
  validateChangePassword
};


/**
 * Middleware to validate forgot password input
 */
const validateForgotPassword = (req, res, next) => {
  const { email } = req.body;

  // Check required field
  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required"
    });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email format"
    });
  }

  next();
};

/**
 * Middleware to validate update profile input
 */
const validateUpdateProfile = (req, res, next) => {
  const { fullname, citizen_id, permanent_address, dob, gender, phone } = req.body;

  // Validate fullname if provided
  if (fullname !== undefined && fullname !== null && fullname.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: "Họ và tên phải có ít nhất 2 ký tự"
    });
  }

  // Validate citizen_id if provided
  if (citizen_id !== undefined && citizen_id !== null && citizen_id.trim().length < 9) {
    return res.status(400).json({
      success: false,
      message: "CCCD/CMND không hợp lệ"
    });
  }

  // Validate gender if provided
  if (gender !== undefined && gender !== null && !['male', 'female', 'other'].includes(gender)) {
    return res.status(400).json({
      success: false,
      message: "Giới tính không hợp lệ. Phải là: male, female, hoặc other"
    });
  }

  // Validate dob if provided
  if (dob !== undefined && dob !== null) {
    const date = new Date(dob);
    if (isNaN(date.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Ngày sinh không hợp lệ"
      });
    }
  }

  // Validate phone if provided (đơn giản, giống logic trên frontend)
  if (phone !== undefined && phone !== null) {
    const phoneTrimmed = String(phone).trim();
    if (phoneTrimmed && !/^0\d{9,10}$/.test(phoneTrimmed)) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại không hợp lệ (bắt đầu bằng 0 và có 10–11 số)"
      });
    }
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
  validateUpdateProfile
};
