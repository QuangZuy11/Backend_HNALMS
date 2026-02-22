const requestService = require("../services/request.service");

/**
 * Lấy danh sách yêu cầu sửa chữa
 * GET /api/requests/repair
 * Chỉ dành cho role manager
 */
exports.getRepairRequests = async (req, res) => {
  try {
    const repairRequests = await requestService.getRepairRequests();

    res.json({
      success: true,
      message: "Lấy danh sách yêu cầu sửa chữa thành công",
      data: repairRequests,
      total: repairRequests.length,
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
 * Cập nhật trạng thái yêu cầu sửa chữa
 * PUT /api/requests/repair/:requestId/status
 * Body: { status: "Pending" | "Processing" | "Done" }
 */
exports.updateRepairStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Thiếu trạng thái cần cập nhật",
      });
    }

    const updated = await requestService.updateRepairRequestStatus(
      requestId,
      status
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
