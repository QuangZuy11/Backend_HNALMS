const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const UserInfo = require("../models/userInfor.model");
const { generateToken } = require("../../../shared/config/jwt");

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Object} Created user and token
 */
const registerUser = async (userData) => {
  const { email, password, role } = userData;

  // Check if user already exists
  const existingUser = await User.findOne({ email: String(email).toLowerCase() });
  if (existingUser) {
    throw new Error("Email already exists");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user
  const mongoose = require("mongoose");
  const newUser = new User({
    user_id: new mongoose.Types.ObjectId().toString(), // tạo user mới với điều kiện
    email: String(email).toLowerCase(),
    password: hashedPassword,
    role: role || "tenant",
    isactive: true,
    create_at: new Date()
  });

  await newUser.save();

  // Verify user_id exists
  if (!newUser.user_id) {
    throw new Error("Failed to create user_id");
  }

  // Generate JWT token
  const token = generateToken({
    userId: newUser.user_id,
    role: newUser.role
  });

  return {
    token,
    user: {
      user_id: newUser.user_id,
      email: newUser.email,
      role: newUser.role,
      isactive: newUser.isactive,
      create_at: newUser.create_at
    }
  };
};

/**
 * Login user
 * @param {string} email - Email
 * @param {string} password - User password
 * @returns {Object} User data and token
 */
const loginUser = async (email, password) => {
  // Find user by email
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user) {
    throw new Error("Email hoặc mật khẩu không chính xác");
  }

  // Check account status (ERD: isactive)
  if (!user.isactive) {
    throw new Error("Tài khoản chưa được kích hoạt");
  }

  // Compare password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Email hoặc mật khẩu không chính xác");
  }

  // Ensure user_id exists - if not, create it (for old users)
  if (!user.user_id) {
    const mongoose = require("mongoose");
    user.user_id = new mongoose.Types.ObjectId().toString();
    await user.save();
  }

  // Lấy thông tin UserInfo (nếu có) để trả thêm fullname, phone, ...
  const userInfo = await UserInfo.findOne({ user: user._id });

  // Generate JWT token
  const token = generateToken({
    userId: user.user_id,
    role: user.role
  });

  return {
    token,
    user: {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      isactive: user.isactive,
      create_at: user.create_at,
      fullname: userInfo?.fullname || null,
      citizen_id: userInfo?.citizen_id || null,
      permanent_address: userInfo?.permanent_address || null,
      dob: userInfo?.dob || null,
      gender: userInfo?.gender || null,
      phone: userInfo?.phone || null
    }
  };
};

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Object} User data
 */
const getUserById = async (userId) => {
  const user = await User.findOne({ user_id: userId }).select("-password");
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};

/**
 * Get user profile (User + UserInfo)
 * @param {string} userId - User ID (user_id string)
 * @returns {Object} Combined user profile data
 */
const getUserProfile = async (userId) => {
  // 1. Tìm User theo user_id (string)
  const user = await User.findOne({ user_id: userId }).select("-password");
  if (!user) {
    throw new Error("User not found");
  }

  // 2. Tìm UserInfo theo user._id (ObjectId)
  const userInfo = await UserInfo.findOne({ user: user._id });

  // 3. Merge thông tin từ User và UserInfo
  return {
    // Từ User model
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    isactive: user.isactive,
    create_at: user.create_at,

    // Từ UserInfo model (có thể null nếu chưa tạo UserInfo)
    fullname: userInfo?.fullname || null,
    citizen_id: userInfo?.citizen_id || null,
    permanent_address: userInfo?.permanent_address || null,
    dob: userInfo?.dob || null,
    gender: userInfo?.gender || null,
    phone: userInfo?.phone || null
  };
};

/**
 * Update user profile (UserInfo)
 * @param {string} userId - User ID (user_id string)
 * @param {Object} profileData - Profile data to update
 * @returns {Object} Updated profile data
 */
const updateProfile = async (userId, profileData) => {
  // 1. Tìm User theo user_id
  const user = await User.findOne({ user_id: userId });
  if (!user) {
    throw new Error("User not found");
  }

  // 2. Tìm hoặc tạo UserInfo
  let userInfo = await UserInfo.findOne({ user: user._id });

  if (!userInfo) {
    // Nếu chưa có UserInfo, tạo mới
    userInfo = new UserInfo({
      user: user._id,
      ...profileData
    });
  } else {
    // Nếu đã có, cập nhật
    Object.assign(userInfo, profileData);
  }

  await userInfo.save();

  // 3. Trả về profile đã cập nhật
  return {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    isactive: user.isactive,
    create_at: user.create_at,
    fullname: userInfo.fullname || null,
    citizen_id: userInfo.citizen_id || null,
    permanent_address: userInfo.permanent_address || null,
    dob: userInfo.dob || null,
    gender: userInfo.gender || null,
    phone: userInfo.phone || null
  };
};

/**
 * Update user password
 * @param {string} userId - User ID
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {boolean} Success status
 */
const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await User.findOne({ user_id: userId });
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
const verifyEmail = async () => {
  throw new Error("Email verification is not supported in current User model");
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
  const normalizedEmail = String(email).toLowerCase();

  // Find user
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new Error("Email not found");
  }

  // Check account status
  if (!user.isactive) {
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
      user_id: user.user_id,
      email: user.email
    },
    newPassword
  };
};

module.exports = {
  registerUser,
  loginUser,
  getUserById,
  getUserProfile,
  updateProfile,
  changePassword,
  verifyEmail,
  forgotPassword
};
