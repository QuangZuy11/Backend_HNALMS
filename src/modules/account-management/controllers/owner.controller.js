const accountService = require("../services/account.service");

/**
 * Tạo tài khoản Chủ nhà (Owner) - Chỉ Admin
 * POST /accounts/owners
 */
exports.createOwner = async (req, res) => {
  try {
    const { username, phoneNumber, email, password } = req.body;
    const createdBy = req.user?.userId;
    const user = await accountService.createAccountByRole(
      { username, phoneNumber, email, password, role: "owner" },
      createdBy
    );
    res.status(201).json({
      success: true,
      message: "Tạo tài khoản Chủ nhà thành công",
      data: user,
    });
  } catch (error) {
    console.error("Create owner error:", error);
    if (error.message.includes("đã tồn tại")) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Danh sách tài khoản Chủ nhà - Chỉ Admin (lấy theo role owner)
 * GET /accounts/owners
 */
exports.getOwners = async (req, res) => {
  try {
    const creatorRole = req.user?.role;
    if (creatorRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ Admin mới xem được danh sách Chủ nhà",
      });
    }
    const rawOffset = req.query.offset;
    const rawLimit = req.query.limit;
    const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);
    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 10, 1), 100);

    const accounts = await accountService.getAccountsByRole("owner");
    const total = accounts.length;
    const pagedAccounts = accounts.slice(offset, offset + limit);

    res.json({
      success: true,
      message: "Lấy danh sách Chủ nhà thành công",
      data: pagedAccounts,
      total,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Get owners error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Chi tiết tài khoản Chủ nhà - Chỉ Admin
 * GET /accounts/owners/:id
 */
exports.getOwnerById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const creatorRole = req.user?.role;
    if (creatorRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ Admin mới xem chi tiết Chủ nhà",
      });
    }
    const account = await accountService.getAccountDetail(id, currentUserId, creatorRole);
    if (account.role !== "owner") {
      return res.status(404).json({
        success: false,
        message: "Tài khoản không phải Chủ nhà",
      });
    }
    res.json({
      success: true,
      message: "Lấy chi tiết Chủ nhà thành công",
      data: account,
    });
  } catch (error) {
    console.error("Get owner detail error:", error);
    if (error.message.includes("không tồn tại")) {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message.includes("không có quyền")) {
      return res.status(403).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Đóng tài khoản Chủ nhà - Chỉ Admin
 * PUT /accounts/owners/:id/disable
 */
exports.disableOwner = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const creatorRole = req.user?.role;
    if (creatorRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ Admin mới được đóng tài khoản Chủ nhà",
      });
    }
    const user = await accountService.disableAccount(id, currentUserId, creatorRole);
    res.json({
      success: true,
      message: "Đã đóng tài khoản Chủ nhà thành công",
      data: user,
    });
  } catch (error) {
    console.error("Disable owner error:", error);
    if (error.message.includes("không tồn tại")) return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes("không có quyền") || error.message.includes("đã bị đóng") || error.message.includes("chỉ có thể")) {
      return res.status(403).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Mở lại tài khoản Chủ nhà - Chỉ Admin
 * PUT /accounts/owners/:id/enable
 */
exports.enableOwner = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const creatorRole = req.user?.role;
    if (creatorRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ Admin mới được mở lại tài khoản Chủ nhà",
      });
    }
    const user = await accountService.enableAccount(id, currentUserId, creatorRole);
    res.json({
      success: true,
      message: "Đã mở lại tài khoản Chủ nhà thành công",
      data: user,
    });
  } catch (error) {
    console.error("Enable owner error:", error);
    if (error.message.includes("không tồn tại")) return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes("không có quyền") || error.message.includes("đang hoạt động") || error.message.includes("chỉ có thể")) {
      return res.status(403).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};
