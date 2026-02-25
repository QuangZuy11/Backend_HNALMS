const accountService = require("../services/account.service");

/**
 * Tạo tài khoản Quản lý hoặc Kế toán - Chỉ Owner
 * POST /accounts/managers
 * body: { username, phoneNumber, email, password, role } với role = 'manager' | 'accountant'
 */
exports.createManagerOrAccountant = async (req, res) => {
  try {
    const { username, phoneNumber, email, password, role } = req.body;
    const createdBy = req.user?.userId;
    if (!["manager", "accountant"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role phải là manager hoặc accountant",
      });
    }
    const user = await accountService.createAccountByRole(
      { username, phoneNumber, email, password, role },
      createdBy
    );
    res.status(201).json({
      success: true,
      message: "Tạo tài khoản thành công",
      data: user,
    });
  } catch (error) {
    console.error("Create manager/accountant error:", error);
    if (error.message.includes("đã tồn tại")) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Danh sách Quản lý & Kế toán - Owner hoặc Admin
 * GET /accounts/managers
 */
exports.getManagers = async (req, res) => {
  try {
    const creatorRole = (req.user?.role || "").toLowerCase();
    if (creatorRole !== "owner" && creatorRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ Chủ nhà hoặc Admin mới xem được danh sách Quản lý/Kế toán",
      });
    }
    const rawOffset = req.query.offset;
    const rawLimit = req.query.limit;
    const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);
    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 10, 1), 100);

    const accounts = await accountService.getAccountsByRole(["manager", "accountant"]);
    const total = accounts.length;
    const pagedAccounts = accounts.slice(offset, offset + limit);

    res.json({
      success: true,
      message: "Lấy danh sách Quản lý/Kế toán thành công",
      data: pagedAccounts,
      total,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Get managers error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Chi tiết tài khoản Quản lý/Kế toán - Owner hoặc Admin
 * GET /accounts/managers/:id
 */
exports.getManagerById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const creatorRole = req.user?.role;
    const account = await accountService.getAccountDetail(id, currentUserId, creatorRole);
    if (!["manager", "accountant"].includes(account.role)) {
      return res.status(404).json({
        success: false,
        message: "Tài khoản không phải Quản lý/Kế toán",
      });
    }
    res.json({
      success: true,
      message: "Lấy chi tiết thành công",
      data: account,
    });
  } catch (error) {
    console.error("Get manager detail error:", error);
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
 * Đóng tài khoản Quản lý/Kế toán - Owner hoặc Admin
 * PUT /accounts/managers/:id/disable
 */
exports.disableManager = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const creatorRole = req.user?.role;
    const user = await accountService.disableAccount(id, currentUserId, creatorRole);
    res.json({
      success: true,
      message: "Đã đóng tài khoản thành công",
      data: user,
    });
  } catch (error) {
    console.error("Disable manager error:", error);
    if (error.message.includes("không tồn tại")) return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes("không có quyền") || error.message.includes("đã bị đóng") || error.message.includes("chỉ có thể")) {
      return res.status(403).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Mở lại tài khoản Quản lý/Kế toán - Owner hoặc Admin
 * PUT /accounts/managers/:id/enable
 */
exports.enableManager = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const creatorRole = req.user?.role;
    const user = await accountService.enableAccount(id, currentUserId, creatorRole);
    res.json({
      success: true,
      message: "Đã mở lại tài khoản thành công",
      data: user,
    });
  } catch (error) {
    console.error("Enable manager error:", error);
    if (error.message.includes("không tồn tại")) return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes("không có quyền") || error.message.includes("đang hoạt động") || error.message.includes("chỉ có thể")) {
      return res.status(403).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};
