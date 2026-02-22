const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/user.model");
const UserInfo = require("../models/userInfor.model");
const { generateToken } = require("../../../shared/config/jwt");

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Object} Created user and token
 */
const registerUser = async (userData) => {
  const { username, phoneNumber, email, password, role } = userData;

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
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user
  const newUser = new User({
    username,
    phoneNumber,
    email: String(email).toLowerCase(),
    password: hashedPassword,
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
 * @param {string} password - User password (raw, will be hashed for comparison)
 * @returns {Object} User data and token
 */
const loginUser = async (username, password) => {
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
  const isMatch = await bcrypt.compare(password, user.password);
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
  const user = await User.findById(userId).select("-password");
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
  const user = await User.findById(userId).select("-password");
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
 * @param {string} oldPassword - Current password (raw, will be hashed for comparison)
 * @param {string} newPassword - New password (raw, will be hashed)
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
  user.password = hashedPassword;
  await user.save();

  return {
    user: {
      _id: user._id,
      email: user.email,
    },
    newPassword,
  };
};

/**
 * Create account by role (Admin/Owner tạo tài khoản cho cấp dưới)
 * Admin -> Owner | Owner -> Manager, Accountant
 * Không trả về token - người tạo vẫn đăng nhập
 * @param {Object} userData - { username, phoneNumber, email, password, role }
 * @param {string} createdBy - userId của người tạo (optional, cho audit)
 * @returns {Object} Created user (without password, no token)
 */
const createAccountByRole = async (userData, createdBy = null) => {
  const { username, phoneNumber, email, password, role } = userData;

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

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = new User({
    username,
    phoneNumber,
    email: String(email).toLowerCase(),
    password: hashedPassword,
    role: role || "Tenant",
    status: "active",
    createdBy: createdBy || null,
    createdAt: new Date(),
  });

  await newUser.save();

  return {
    _id: newUser._id,
    username: newUser.username,
    email: newUser.email,
    phoneNumber: newUser.phoneNumber,
    role: newUser.role,
    status: newUser.status,
    createdAt: newUser.createdAt,
  };
};

// Owner chỉ xem Manager, Accountant, Tenant | Manager chỉ xem Tenant
// Admin sẽ có quyền xem tất cả tài khoản (không phụ thuộc map này)
const ALLOWED_VIEW_ROLES = {
  owner: ['manager', 'accountant', 'Tenant'],
  manager: ['Tenant']
};

/**
 * Lấy danh sách tài khoản (theo đúng quyền)
 * Admin: xem được tất cả tài khoản | Owner: Manager, Accountant | Manager: tất cả Tenant
 * @param {string} userId - User ID của người xem
 * @param {string} creatorRole - Role của người xem (admin, owner, manager)
 * @returns {Array} Danh sách user (không có password)
 */
const getCreatedAccounts = async (userId, creatorRole) => {
  const roleKey = (creatorRole || "").toLowerCase();

  // Admin: xem được toàn bộ tài khoản trong hệ thống
  if (roleKey === 'admin') {
    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();
    return users;
  }

  const allowedRoles = ALLOWED_VIEW_ROLES[roleKey];
  if (!allowedRoles || allowedRoles.length === 0) {
    return [];
  }

  if (roleKey === 'manager') {
    const users = await User.aggregate([
      { $match: { role: { $in: allowedRoles } } },
      { $sort: { createdAt: -1 } },
      { $project: { password: 0 } },
      {
        $lookup: {
          from: 'userinfos',
          localField: '_id',
          foreignField: 'userId',
          as: '_userInfo'
        }
      },
      {
        $addFields: {
          fullname: { $ifNull: [{ $arrayElemAt: ['$_userInfo.fullname', 0] }, null] }
        }
      },
      { $project: { _userInfo: 0 } }
    ]);
    return users;
  }

  // Owner: lấy tất cả Manager, Accountant (có fullname từ userinfos)
  const users = await User.aggregate([
    { $match: { role: { $in: allowedRoles } } },
    { $sort: { createdAt: -1 } },
    { $project: { password: 0 } },
    {
      $lookup: {
        from: 'userinfos',
        localField: '_id',
        foreignField: 'userId',
        as: '_userInfo'
      }
    },
    {
      $addFields: {
        fullname: { $ifNull: [{ $arrayElemAt: ['$_userInfo.fullname', 0] }, null] }
      }
    },
    { $project: { _userInfo: 0 } }
  ]);
  return users;
};

/**
 * Đóng tài khoản - Chỉ chuyển status sang inactive, không xóa DB
 * Chỉ cho phép đóng tài khoản do chính user hiện tại tạo
 * @param {string} accountId - ID tài khoản cần đóng
 * @param {string} currentUserId - ID user đang thực hiện (người tạo)
 * @returns {Object} User đã cập nhật
 */
/**
 * Xem chi tiết tài khoản (theo đúng quyền)
 * Admin: xem được mọi tài khoản | Owner: Manager, Accountant | Manager: Tenant
 * @param {string} accountId - ID tài khoản
 * @param {string} currentUserId - ID user đang xem
 * @param {string} creatorRole - Role của người xem (admin, owner, manager)
 * @returns {Object} User + UserInfo
 */
const getCreatedAccountDetail = async (accountId, currentUserId, creatorRole) => {
  const user = await User.findById(accountId).select("-password").lean();
  if (!user) {
    throw new Error("Tài khoản không tồn tại");
  }

  const roleKey = (creatorRole || "").toLowerCase();

  // Admin: xem được chi tiết mọi tài khoản, không giới hạn theo createdBy hay role
  if (roleKey !== 'admin') {
    const allowedRoles = ALLOWED_VIEW_ROLES[roleKey];
    if (!allowedRoles || !allowedRoles.includes(user.role)) {
      throw new Error("Bạn không có quyền xem tài khoản với vai trò này");
    }
  }

  const userInfo = await UserInfo.findOne({ userId: user._id }).lean();

  return {
    ...user,
    fullname: userInfo?.fullname || null,
    cccd: userInfo?.cccd || null,
    address: userInfo?.address || null,
    dob: userInfo?.dob || null,
    gender: userInfo?.gender || null,
  };
};

const disableAccount = async (accountId, currentUserId, creatorRole) => {
  const user = await User.findById(accountId);
  if (!user) {
    throw new Error("Tài khoản không tồn tại");
  }

  const roleKey = (creatorRole || "").toLowerCase();
  if (roleKey === 'admin') {
    // Admin chỉ được đóng tài khoản Chủ nhà (Owner)
    if (user.role !== 'owner') {
      throw new Error("Admin chỉ có thể đóng tài khoản Chủ nhà (Owner)");
    }
  } else if (roleKey === 'owner') {
    // Owner chỉ được đóng tài khoản Manager/Kế toán (không đóng Tenant)
    if (!['manager', 'accountant'].includes(user.role)) {
      throw new Error("Chủ nhà chỉ có thể đóng tài khoản Quản lý/Kế toán");
    }
  } else {
    const allowedRoles = ALLOWED_VIEW_ROLES[roleKey];
    if (!allowedRoles || !allowedRoles.includes(user.role)) {
      throw new Error("Bạn không có quyền đóng tài khoản với vai trò này");
    }
  }

  if (user.status === "inactive") {
    throw new Error("Tài khoản đã bị đóng trước đó");
  }

  user.status = "inactive";
  await user.save();

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
};

const enableAccount = async (accountId, currentUserId, creatorRole) => {
  const user = await User.findById(accountId);
  if (!user) {
    throw new Error("Tài khoản không tồn tại");
  }

  const roleKey = (creatorRole || "").toLowerCase();
  if (roleKey === 'admin') {
    // Admin chỉ được mở lại tài khoản Chủ nhà (Owner)
    if (user.role !== 'owner') {
      throw new Error("Admin chỉ có thể mở lại tài khoản Chủ nhà (Owner)");
    }
  } else if (roleKey === 'owner') {
    // Owner chỉ được mở lại tài khoản Manager/Kế toán (không mở Tenant)
    if (!['manager', 'accountant'].includes(user.role)) {
      throw new Error("Chủ nhà chỉ có thể mở lại tài khoản Quản lý/Kế toán");
    }
  } else {
    const allowedRoles = ALLOWED_VIEW_ROLES[roleKey];
    if (!allowedRoles || !allowedRoles.includes(user.role)) {
      throw new Error("Bạn không có quyền mở lại tài khoản với vai trò này");
    }
  }

  if (user.status === "active") {
    throw new Error("Tài khoản đang hoạt động");
  }

  user.status = "active";
  await user.save();

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
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
  createAccountByRole,
  getCreatedAccounts,
  getCreatedAccountDetail,
  disableAccount,
  enableAccount,
};
