/**
 * Complaint Request Controller
 * Xử lý các request liên quan đến khiếu nại từ phía mobile/frontend
 */

const complaintService = require("../services/complaint.service");
const { successResponse, errorResponse } = require("../../../shared/utils/response");

/**
 * POST /api/requests/complaints
 * Tạo yêu cầu khiếu nại mới từ mobile frontend
 */
exports.createComplaint = async (req, res) => {
  try {
    const { content, category } = req.body;
    const tenantId = req.user?.userId;

    // Validate required fields
    if (!content || !category) {
      return errorResponse(
        res,
        "Content và Category là bắt buộc",
        400
      );
    }

    // Create complaint request
    const complaint = await complaintService.createComplaintRequest({
      tenantId,
      content,
      category
    });

    return successResponse(
      res,
      complaint,
      "Khiếu nại được tạo thành công",
      201
    );
  } catch (error) {
    console.error("Create complaint error:", error);
    return errorResponse(
      res,
      error.message || "Lỗi khi tạo khiếu nại",
      500
    );
  }
};

/**
 * GET /api/requests/complaints/:id
 * Lấy chi tiết yêu cầu khiếu nại theo ID
 */
exports.getComplaintById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return errorResponse(
        res,
        "ID không hợp lệ",
        400
      );
    }

    const complaint = await complaintService.getComplaintById(id);

    if (!complaint) {
      return errorResponse(
        res,
        "Khiếu nại không tồn tại",
        404
      );
    }

    // Check permissions: owner, manager, or admin can view
    const isOwner = complaint.tenantId._id 
      ? complaint.tenantId._id.toString() === userId.toString()
      : complaint.tenantId.toString() === userId.toString();
    
    const canView = isOwner || ["manager", "admin"].includes(userRole);

    if (!canView) {
      return errorResponse(
        res,
        "Bạn không có quyền xem khiếu nại này",
        403
      );
    }

    return successResponse(
      res,
      complaint,
      "Lấy chi tiết khiếu nại thành công"
    );
  } catch (error) {
    console.error("Get complaint by ID error:", error);
    return errorResponse(
      res,
      error.message || "Lỗi khi lấy khiếu nại",
      500
    );
  }
};

/**
 * GET /api/requests/complaints
 * Lấy danh sách khiếu nại của tenant hiện tại hoặc tất cả (nếu là admin)
 */
exports.getComplaintList = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { status, page, limit, category } = req.query;

    // Admin & Manager: xem được tất cả khiếu nại
    // Các role khác (tenant, ...) chỉ xem được khiếu nại của chính mình
    const isAdminOrManager = ["admin", "manager"].includes(userRole);

    const filters = {
      ...(status && { status }),
      ...(category && { category }),
      ...(!isAdminOrManager && { tenantId: userId })
    };

    const complaints = await complaintService.getComplaintsList(
      filters,
      parseInt(page) || 1,
      parseInt(limit) || 10
    );

    return successResponse(
      res,
      complaints,
      "Lấy danh sách khiếu nại thành công"
    );
  } catch (error) {
    console.error("Get complaint list error:", error);
    return errorResponse(
      res,
      error.message || "Lỗi khi lấy danh sách khiếu nại",
      500
    );
  }
};

/**
 * PUT /api/requests/complaints/:id
 * Cập nhật khiếu nại (chỉ tenant có thể update content/category khi Pending)
 */
exports.updateComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, category } = req.body;
    const userId = req.user?.userId;

    const complaint = await complaintService.getComplaintById(id);

    if (!complaint) {
      return errorResponse(
        res,
        "Khiếu nại không tồn tại",
        404
      );
    }

    // Only owner can update pending complaint
    const ownerIdUpdate = complaint.tenantId?._id
      ? complaint.tenantId._id.toString()
      : complaint.tenantId.toString();
    if (ownerIdUpdate !== userId.toString()) {
      return errorResponse(
        res,
        "Bạn không có quyền cập nhật khiếu nại này",
        403
      );
    }

    if (complaint.status !== "Pending") {
      return errorResponse(
        res,
        "Chỉ có thể cập nhật khiếu nại ở trạng thái Pending",
        400
      );
    }

    const updatedComplaint = await complaintService.updateComplaintRequest(id, {
      content,
      category
    });

    return successResponse(
      res,
      updatedComplaint,
      "Cập nhật khiếu nại thành công"
    );
  } catch (error) {
    console.error("Update complaint error:", error);
    return errorResponse(
      res,
      error.message || "Lỗi khi cập nhật khiếu nại",
      500
    );
  }
};

/**
 * PUT /api/requests/complaints/:id/status
 * Cập nhật trạng thái khiếu nại (chỉ manager/admin)
 */
exports.updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, response } = req.body;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    // Only manager/admin can update status
    if (!["manager", "admin"].includes(userRole)) {
      return errorResponse(
        res,
        "Bạn không có quyền cập nhật trạng thái",
        403
      );
    }

    if (!status || !["Pending", "Processing", "Done"].includes(status)) {
      return errorResponse(
        res,
        "Trạng thái không hợp lệ",
        400
      );
    }

    const updatedComplaint = await complaintService.updateComplaintStatus(
      id,
      status,
      response,
      userId
    );

    return successResponse(
      res,
      updatedComplaint,
      "Cập nhật trạng thái khiếu nại thành công"
    );
  } catch (error) {
    console.error("Update complaint status error:", error);
    return errorResponse(
      res,
      error.message || "Lỗi khi cập nhật trạng thái khiếu nại",
      500
    );
  }
};

/**
 * DELETE /api/requests/complaints/:id
 * Xóa yêu cầu khiếu nại (chỉ tenant có thể xóa khi Pending)
 */
exports.deleteComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const complaint = await complaintService.getComplaintById(id);

    if (!complaint) {
      return errorResponse(
        res,
        "Khiếu nại không tồn tại",
        404
      );
    }

    // Only owner can delete pending complaint
    const ownerIdDelete = complaint.tenantId?._id
      ? complaint.tenantId._id.toString()
      : complaint.tenantId.toString();
    if (ownerIdDelete !== userId.toString()) {
      return errorResponse(
        res,
        "Bạn không có quyền xóa khiếu nại này",
        403
      );
    }

    if (complaint.status !== "Pending") {
      return errorResponse(
        res,
        "Chỉ có thể xóa khiếu nại ở trạng thái Pending",
        400
      );
    }

    await complaintService.deleteComplaint(id);

    return successResponse(
      res,
      null,
      "Xóa khiếu nại thành công"
    );
  } catch (error) {
    console.error("Delete complaint error:", error);
    return errorResponse(
      res,
      error.message || "Lỗi khi xóa khiếu nại",
      500
    );
  }
};

/**
 * GET /api/requests/complaints/stats/dashboard
 * Lấy thống kê khiếu nại cho dashboard
 */
exports.getComplaintStats = async (req, res) => {
  try {
    const stats = await complaintService.getComplaintStatistics();

    return successResponse(
      res,
      stats,
      "Lấy thống kê khiếu nại thành công"
    );
  } catch (error) {
    console.error("Get complaint stats error:", error);
    return errorResponse(
      res,
      error.message || "Lỗi khi lấy thống kê",
      500
    );
  }
};
