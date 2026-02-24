const { isValidEmail, validatePassword, validateUsername } = require("../../authentication/validators/auth.validator");

/**
 * Tạo Chủ nhà: body { username, phoneNumber, email, password } (role = owner cố định)
 */
const validateCreateOwner = (req, res, next) => {
  const { username, phoneNumber, email, password } = req.body || {};
  if (!username || !phoneNumber || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Username, phone number, email và password là bắt buộc",
    });
  }
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return res.status(400).json({ success: false, message: usernameValidation.message });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Email không đúng định dạng" });
  }
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ success: false, message: passwordValidation.message });
  }
  next();
};

/**
 * Tạo Quản lý/Kế toán: body { username, phoneNumber, email, password, role } với role = manager | accountant
 */
const validateCreateManager = (req, res, next) => {
  const { username, phoneNumber, email, password, role } = req.body || {};
  if (!username || !phoneNumber || !email || !password || !role) {
    return res.status(400).json({
      success: false,
      message: "Username, phone number, email, password và role là bắt buộc",
    });
  }
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return res.status(400).json({ success: false, message: usernameValidation.message });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Email không đúng định dạng" });
  }
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ success: false, message: passwordValidation.message });
  }
  if (!["manager", "accountant"].includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Role phải là manager hoặc accountant",
    });
  }
  next();
};

module.exports = {
  validateCreateOwner,
  validateCreateManager,
};
