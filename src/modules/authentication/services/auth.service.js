const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const { generateToken } = require("../../../shared/config/jwt");

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Object} Created user and token
 */
const registerUser = async (userData) => {
  const { username, fullname, email, password, role } = userData;

  // Check if user already exists
  const existingEmail = await User.findOne({ email });
  const existingUsername = await User.findOne({ username });

  if (existingEmail && existingUsername) {
    throw new Error("Email and username already exist");
  }

  if (existingEmail) {
    throw new Error("Email already exists");
  }

  if (existingUsername) {
    throw new Error("Username already exists");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user
  const newUser = new User({
    username,
    fullname,
    email,
    password: hashedPassword,
    role: role || "tenant", // Default role is tenant
    status: "active"
  });

  await newUser.save();

  // Generate JWT token
  const token = generateToken({
    userId: newUser._id,
    role: newUser.role
  });

  return {
    token,
    user: {
      id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      fullname: newUser.fullname,
      role: newUser.role
    }
  };
};

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Object} User data and token
 */
const loginUser = async (email, password) => {
  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("Email or password is incorrect");
  }

  // Check account status
  if (user.status !== "active") {
    throw new Error("Account is not active");
  }

  // Compare password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Email or password is incorrect");
  }

  // Generate JWT token
  const token = generateToken({
    userId: user._id,
    role: user.role
  });

  return {
    token,
    user: {
      id: user._id,
      email: user.email,
      fullname: user.fullname,
      role: user.role,
      username: user.username,
      avatarURL: user.avatarURL
    }
  };
};

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Object} User data
 */
const getUserById = async (userId) => {
  const user = await User.findById(userId).select("-password");
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};

/**
 * Update user password
 * @param {string} userId - User ID
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {boolean} Success status
 */
const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Verify old password
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new Error("Current password is incorrect");
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();

  return true;
};

/**
 * Verify user email exists
 * @param {string} email - User email
 * @returns {Object} User data
 */
const verifyEmail = async (email) => {
  const user = await User.findOne({ email }).select("-password");
  if (!user) {
    throw new Error("Email not found");
  }
  return user;
};

/**
 * Generate random password
 * @param {number} length - Password length
 * @returns {string} Random password
 */
const generateRandomPassword = (length = 10) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

/**
 * Forgot password - Generate new password and send email
 * @param {string} email - User email
 * @returns {Object} Success message
 */
const forgotPassword = async (email) => {
  // Find user
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("Email not found");
  }

  // Check account status
  if (user.status !== "active") {
    throw new Error("Account is not active");
  }

  // Generate new random password
  const newPassword = generateRandomPassword(10);

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update user password
  user.password = hashedPassword;
  await user.save();

  return {
    user: {
      id: user._id,
      email: user.email,
      fullname: user.fullname
    },
    newPassword: newPassword
  };
};

module.exports = {
  registerUser,
  loginUser,
  getUserById,
  changePassword,
  verifyEmail,
  forgotPassword
};
