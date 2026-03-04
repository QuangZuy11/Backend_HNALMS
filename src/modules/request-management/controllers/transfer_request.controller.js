const transferService = require("../services/transfer_request.service");

/**
 * [TENANT] Lấy danh sách phòng trống để chọn chuyển đến
 * GET /api/requests/transfer/available-rooms
 */
exports.getAvailableRoomsForTransfer = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const result = await transferService.getAvailableRoomsForTransfer(tenantId);

    res.status(200).json({
      success: true,
      message: "Lấy danh sách phòng trống thành công",
      data: result,
    });
  } catch (error) {
    console.error("Get available rooms for transfer error:", error);
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * [TENANT] Tạo yêu cầu chuyển phòng
 * POST /api/requests/transfer
 * Body: { targetRoomId, transferDate, reason }
 */
exports.createTransferRequest = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const result = await transferService.createTransferRequest(
      tenantId,
      req.body,
    );

    res.status(201).json({
      success: true,
      message:
        "Tạo yêu cầu chuyển phòng thành công. Vui lòng đợi quản lý xác nhận.",
      data: result,
    });
  } catch (error) {
    console.error("Create transfer request error:", error);
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * [MANAGER] Lấy tất cả yêu cầu chuyển phòng
 * GET /api/requests/transfer
 */
exports.getAllTransferRequests = async (req, res) => {
  try {
    const TransferRequest = require("../models/transfer_request.model");
    const requests = await TransferRequest.find()
      .populate("tenantId", "fullName phoneNumber email")
      .populate("contractId", "contractId")
      .populate("currentRoomId", "name")
      .populate("targetRoomId", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Lấy danh sách yêu cầu chuyển phòng thành công",
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Get all transfer requests error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * [TENANT] Xem danh sách yêu cầu chuyển phòng của mình
 * GET /api/requests/transfer/my-requests
 */
exports.getMyTransferRequests = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const requests = await transferService.getMyTransferRequests(tenantId);

    res.status(200).json({
      success: true,
      message: "Lấy danh sách yêu cầu chuyển phòng thành công",
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Get my transfer requests error:", error);
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * [TENANT] Hủy yêu cầu chuyển phòng (chỉ khi đang Pending)
 * PATCH /api/requests/transfer/:id/cancel
 */
exports.cancelTransferRequest = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const result = await transferService.cancelTransferRequest(
      tenantId,
      req.params.id,
    );

    res.status(200).json({
      success: true,
      message: "Đã hủy yêu cầu chuyển phòng",
      data: result,
    });
  } catch (error) {
    console.error("Cancel transfer request error:", error);
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};
