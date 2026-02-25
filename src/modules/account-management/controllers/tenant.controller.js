const accountService = require("../services/account.service");

/**
 * Danh sách tài khoản Khách thuê (Tenant) - Manager hoặc Owner
 * GET /accounts/tenants
 */
exports.getTenants = async (req, res) => {
  try {
    const creatorRole = (req.user?.role || "").toLowerCase();
    if (creatorRole !== "manager" && creatorRole !== "owner") {
      return res.status(403).json({
        success: false,
        message: "Chỉ Quản lý hoặc Chủ nhà mới xem được danh sách Khách thuê",
      });
    }
    const rawOffset = req.query.offset;
    const rawLimit = req.query.limit;
    const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);
    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 10, 1), 100);

    const accounts = await accountService.getAccountsByRole("Tenant");
    const total = accounts.length;
    const pagedAccounts = accounts.slice(offset, offset + limit);

    res.json({
      success: true,
      message: "Lấy danh sách Khách thuê thành công",
      data: pagedAccounts,
      total,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Get tenants error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Chi tiết tài khoản Khách thuê - Manager hoặc Owner
 * GET /accounts/tenants/:id
 */
exports.getTenantById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const creatorRole = req.user?.role;
    const account = await accountService.getAccountDetail(id, currentUserId, creatorRole);
    if (account.role !== "Tenant") {
      return res.status(404).json({
        success: false,
        message: "Tài khoản không phải Khách thuê",
      });
    }
    res.json({
      success: true,
      message: "Lấy chi tiết Khách thuê thành công",
      data: account,
    });
  } catch (error) {
    console.error("Get tenant detail error:", error);
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
 * Đóng tài khoản Khách thuê - Manager hoặc Owner
 * PUT /accounts/tenants/:id/disable
 */
exports.disableTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const creatorRole = req.user?.role;
    const user = await accountService.disableAccount(id, currentUserId, creatorRole);
    res.json({
      success: true,
      message: "Đã đóng tài khoản Khách thuê thành công",
      data: user,
    });
  } catch (error) {
    console.error("Disable tenant error:", error);
    if (error.message.includes("không tồn tại")) return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes("không có quyền") || error.message.includes("đã bị đóng")) {
      return res.status(403).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Mở lại tài khoản Khách thuê - Manager hoặc Owner
 * PUT /accounts/tenants/:id/enable
 */
exports.enableTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const creatorRole = req.user?.role;
    const user = await accountService.enableAccount(id, currentUserId, creatorRole);
    res.json({
      success: true,
      message: "Đã mở lại tài khoản Khách thuê thành công",
      data: user,
    });
  } catch (error) {
    console.error("Enable tenant error:", error);
    if (error.message.includes("không tồn tại")) return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes("không có quyền") || error.message.includes("đang hoạt động")) {
      return res.status(403).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};
