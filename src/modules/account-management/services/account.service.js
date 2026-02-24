const bcrypt = require("bcryptjs");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");

/**
 * Tạo tài khoản theo role (Admin -> Owner | Owner -> Manager, Accountant)
 * @param {Object} userData - { username, phoneNumber, email, password, role }
 * @param {string} createdBy - userId của người tạo
 * @returns {Object} User (không có password)
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

const ALLOWED_VIEW_ROLES = {
  owner: ['manager', 'accountant', 'Tenant'],
  manager: ['Tenant']
};

/**
 * Lấy danh sách user theo role (Admin: tất cả | Owner: manager, accountant, Tenant | Manager: Tenant)
 */
const getAccountsByViewerRole = async (userId, creatorRole) => {
  const roleKey = (creatorRole || "").toLowerCase();

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

  const aggregatePipeline = [
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
  ];

  const users = await User.aggregate(aggregatePipeline);
  return users;
};

/**
 * Lấy danh sách chỉ user có role = targetRole (owner | manager/accountant | Tenant)
 */
const getAccountsByRole = async (targetRole) => {
  const roles = Array.isArray(targetRole) ? targetRole : [targetRole];
  const users = await User.aggregate([
    { $match: { role: { $in: roles } } },
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
 * Xem chi tiết tài khoản (theo đúng quyền)
 */
const getAccountDetail = async (accountId, currentUserId, creatorRole) => {
  const user = await User.findById(accountId).select("-password").lean();
  if (!user) {
    throw new Error("Tài khoản không tồn tại");
  }

  const roleKey = (creatorRole || "").toLowerCase();

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
    if (user.role !== 'owner') {
      throw new Error("Admin chỉ có thể đóng tài khoản Chủ nhà (Owner)");
    }
  } else if (roleKey === 'owner') {
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
    if (user.role !== 'owner') {
      throw new Error("Admin chỉ có thể mở lại tài khoản Chủ nhà (Owner)");
    }
  } else if (roleKey === 'owner') {
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
  createAccountByRole,
  getAccountsByViewerRole,
  getAccountsByRole,
  getAccountDetail,
  disableAccount,
  enableAccount,
};
