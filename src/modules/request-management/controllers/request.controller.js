const requestService = require("../services/request.service");

/**
 * Tạo yêu cầu sửa chữa/bảo trì mới
 * POST /api/requests/repair
 * Body: { devicesId, type, description, images? }
 */
exports.createRepairRequest = async (req, res) => {
  try {
    const { devicesId, type, description, images } = req.body;
    const tenantId = req.user?.userId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng",
      });
    }

    const newRequest = await requestService.createRepairRequest({
      tenantId,
      devicesId,
      type,
      description,
      images,
    });

    res.status(201).json({
      success: true,
      message: "Tạo yêu cầu sửa chữa/bảo trì thành công",
      data: newRequest,
    });
  } catch (error) {
    console.error("Create repair request error:", error);

    if (error.message.includes("không tồn tại")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * Lấy danh sách yêu cầu sửa chữa
 * GET /api/requests/repair
 * Chỉ dành cho role manager
 */
exports.getRepairRequests = async (req, res) => {
  try {
    const { roomSearch, tenantSearch, page, limit } = req.query || {};
    const filters = {};
    if (roomSearch && roomSearch.trim()) {
      filters.roomSearch = roomSearch.trim();
    }
    if (tenantSearch && tenantSearch.trim()) {
      filters.tenantSearch = tenantSearch.trim();
    }
    if (page) {
      filters.page = page;
    }
    if (limit) {
      filters.limit = limit;
    }
    
    const result = await requestService.getRepairRequests(filters);

    res.json({
      success: true,
      message: "Lấy danh sách yêu cầu sửa chữa thành công",
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    console.error("Get repair requests error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * Lấy danh sách yêu cầu sửa chữa của tenant hiện tại
 * GET /api/requests/repair/my-requests
 * Dành cho tenant
 */
exports.getMyRepairRequests = async (req, res) => {
  try {
    const tenantId = req.user?.userId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng",
      });
    }

    const repairRequests = await requestService.getRepairRequestsByTenant(tenantId);

    res.json({
      success: true,
      message: "Lấy danh sách yêu cầu thành công",
      data: repairRequests,
      total: repairRequests.length,
    });
  } catch (error) {
    console.error("Get my repair requests error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * Lấy chi tiết yêu cầu sửa chữa theo ID
 * GET /api/requests/repair/:requestId
 * Dành cho manager và tenant (chỉ xem request của mình)
 */
exports.getRepairRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await requestService.getRepairRequestById(requestId);

    // Kiểm tra quyền truy cập
    // Tenant chỉ được xem request của mình
    if (req.user.role === "Tenant" && request.tenantId._id.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem yêu cầu này",
      });
    }

    res.json({
      success: true,
      message: "Lấy chi tiết yêu cầu thành công",
      data: request,
    });
  } catch (error) {
    console.error("Get repair request by ID error:", error);

    if (error.message.includes("không tồn tại")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * Cập nhật trạng thái yêu cầu sửa chữa
 * PUT /api/requests/repair/:requestId/status
 * Body: { status: "Pending" | "Processing" | "Done", cost?: number, notes?: string }
 */
exports.updateRepairStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const {
      status,
      cost,
      notes,
      invoiceCode,
      invoiceTitle,
      invoiceTotalAmount,
      invoiceDueDate,
      // Dành cho sửa chữa miễn phí → tạo phiếu chi nội bộ
      financialTitle,
      financialAmount,
      financialType,
      // Loại thanh toán (REVENUE / EXPENSE)
      paymentType,
    } = req.body || {};

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Thiếu trạng thái cần cập nhật",
      });
    }

    const invoiceData =
      invoiceCode && invoiceTitle && invoiceTotalAmount && invoiceDueDate
        ? {
            invoiceCode,
            title: invoiceTitle,
            totalAmount: invoiceTotalAmount,
            dueDate: invoiceDueDate,
          }
        : null;

    const financialTicketData =
      financialTitle && financialAmount !== undefined && financialAmount !== null
        ? {
            type: financialType || "Payment",
            title: financialTitle,
            amount: financialAmount,
          }
        : null;

    const updated = await requestService.updateRepairRequestStatus(
      requestId,
      status,
      cost,
      notes,
      invoiceData,
      financialTicketData,
      paymentType
    );

    res.json({
      success: true,
      message: "Cập nhật trạng thái yêu cầu thành công",
      data: updated,
    });
  } catch (error) {
    console.error("Update repair status error:", error);

    if (error.message.includes("không tồn tại")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("không hợp lệ")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * Xóa yêu cầu sửa chữa
 * DELETE /api/requests/repair/:requestId
 * Dành cho manager hoặc tenant (chỉ xóa request của mình, status = Pending)
 */
exports.deleteRepairRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    
    // Lấy thông tin request để kiểm tra quyền
    const request = await requestService.getRepairRequestById(requestId);

    // Kiểm tra quyền xóa
    if (req.user.role === "Tenant") {
      // Tenant chỉ được xóa request của mình và phải ở status Pending
      if (request.tenantId._id.toString() !== req.user.userId) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xóa yêu cầu này",
        });
      }
      
      if (request.status !== "Pending") {
        return res.status(400).json({
          success: false,
          message: "Chỉ có thể xóa yêu cầu đang ở trạng thái Pending",
        });
      }
    }

    // Thực hiện xóa
    const result = await requestService.deleteRepairRequest(requestId);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Delete repair request error:", error);

    if (error.message.includes("không tồn tại")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * Lấy invoiceCode kế tiếp cho hóa đơn sửa chữa (manager)
 * GET /api/requests/repair/next-invoice-code
 */
exports.getNextRepairInvoiceCode = async (req, res) => {
  try {
    const invoiceCode = await requestService.getNextRepairInvoiceCode();
    res.json({
      success: true,
      message: "Lấy mã hóa đơn sửa chữa kế tiếp thành công",
      data: { invoiceCode },
    });
  } catch (error) {
    console.error("Get next repair invoice code error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};
