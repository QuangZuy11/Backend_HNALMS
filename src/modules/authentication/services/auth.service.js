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
  const { username, phoneNumber, email, passwordHash, role } = userData;

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [
      { username },
      { email: String(email).toLowerCase() },
      { phoneNumber }
    ]
  });
  if (existingUser) {
    throw new Error("Username, email hoặc số điện thoại đã tồn tại");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(passwordHash, 10);

  // Create new user
  const newUser = new User({
    username,
    phoneNumber,
    email: String(email).toLowerCase(),
    passwordHash: hashedPassword,
    role: role || "Tenant",
    status: "active",
    createdAt: new Date(),
  });

  await newUser.save();

  // Generate JWT token
  const token = generateToken({
    userId: newUser._id,
    role: newUser.role,
  });

  return {
    token,
    user: {
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      createdAt: newUser.createdAt,
    },
  };
};

/**
 * Login user
 * @param {string} username - Username
 * @param {string} passwordHash - User password (raw, will be hashed for comparison)
 * @returns {Object} User data and token
 */
const loginUser = async (username, passwordHash) => {
  // Find user by username
  const user = await User.findOne({ username });
  if (!user) {
    throw new Error("Tên đăng nhập hoặc mật khẩu không chính xác");
  }

  console.log("🔍 Login Service - User found:", {
    _id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
  });

  // Check account status
  if (user.status !== "active") {
    throw new Error("Tài khoản chưa được kích hoạt");
  }

  // Compare password with hash
  const isMatch = await bcrypt.compare(passwordHash, user.passwordHash);
  if (!isMatch) {
    throw new Error("Tên đăng nhập hoặc mật khẩu không chính xác");
  }

  // Lấy thông tin UserInfo (nếu có)
  const userInfo = await UserInfo.findOne({ userId: user._id });

  // Generate JWT token
  const token = generateToken({
    userId: user._id,
    role: user.role,
  });

  console.log("🔍 Login Service - Generated token with payload:", {
    userId: user._id,
    role: user.role,
  });

  return {
    token,
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      fullname: userInfo?.fullname || null,
      cccd: userInfo?.cccd || null,
      address: userInfo?.address || null,
      dob: userInfo?.dob || null,
      gender: userInfo?.gender || null
    }
  };
};

/**
 * Get user by ID
 * @param {string} userId - User ID (MongoDB ObjectId)
 * @returns {Object} User data
 */
const getUserById = async (userId) => {
  const user = await User.findById(userId).select("-passwordHash");
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};

/**
 * Get user profile (User + UserInfo)
 * @param {string} userId - User ID (MongoDB ObjectId)
 * @returns {Object} Combined user profile data
 */
const getUserProfile = async (userId) => {
  // 1. Tìm User theo _id (ObjectId)
  const user = await User.findById(userId).select("-passwordHash");
  if (!user) {
    throw new Error("User not found");
  }

  // 2. Tìm UserInfo theo userId
  const userInfo = await UserInfo.findOne({ userId: user._id });

  // 3. Merge thông tin từ User và UserInfo
  return {
    // Từ User model
    _id: user._id,
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,

    // Từ UserInfo model (có thể null nếu chưa tạo UserInfo)
    fullname: userInfo?.fullname || null,
    cccd: userInfo?.cccd || null,
    address: userInfo?.address || null,
    dob: userInfo?.dob || null,
    gender: userInfo?.gender || null
  };
};

/**
 * Update user profile (UserInfo)
 * @param {string} userId - User ID (MongoDB ObjectId)
 * @param {Object} profileData - Profile data to update
 * @returns {Object} Updated profile data
 */
const updateProfile = async (userId, profileData) => {
  // 1. Tìm User theo _id
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // 2. Tìm hoặc tạo UserInfo
  let userInfo = await UserInfo.findOne({ userId: user._id });

  // Filter profileData để chỉ lấy những field có giá trị (không null/undefined)
  const filteredData = {};
  Object.keys(profileData).forEach(key => {
    if (profileData[key] !== null && profileData[key] !== undefined) {
      filteredData[key] = profileData[key];
    }
  });

  if (!userInfo) {
    // Nếu chưa có UserInfo, tạo mới
    userInfo = new UserInfo({
      userId: user._id,
      ...filteredData,
    });
  } else {
    // Nếu đã có, cập nhật
    Object.assign(userInfo, filteredData);
  }

  await userInfo.save();

  // 3. Trả về profile đã cập nhật
  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    fullname: userInfo.fullname || null,
    cccd: userInfo.cccd || null,
    address: userInfo.address || null,
    dob: userInfo.dob || null,
    gender: userInfo.gender || null
  };
};

/**
 * Update user password
 * @param {string} userId - User ID (MongoDB ObjectId)
 * @param {string} oldPasswordHash - Current password (raw, will be hashed for comparison)
 * @param {string} newPasswordHash - New password (raw, will be hashed)
 * @returns {boolean} Success status
 */
const changePassword = async (userId, oldPasswordHash, newPasswordHash) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Verify old password
  const isMatch = await bcrypt.compare(oldPasswordHash, user.passwordHash);
  if (!isMatch) {
    throw new Error("Current password is incorrect");
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPasswordHash, 10);
  user.passwordHash = hashedPassword;
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
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
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
  if (user.status !== "active") {
    throw new Error("Account is not active");
  }

  // Generate new random password
  const newPassword = generateRandomPassword(10);

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update user password
  user.passwordHash = hashedPassword;
  await user.save();

  return {
    user: {
      _id: user._id,
      email: user.email,
    },
    newPassword,
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
  forgotPassword,
};
