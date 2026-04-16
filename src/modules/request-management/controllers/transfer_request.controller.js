const transferService = require("../services/transfer_request.service");
const notificationService = require("../../notification-management/services/notification.service");
const Room = require("../../room-floor-management/models/room.model");

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
 * Body: { roomId?, targetRoomId, transferDate, reason }
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

    // Lấy thông tin phòng hiện tại và phòng đích
    const currentRoom = await Room.findById(result.currentRoomId).select('name');
    const targetRoom = await Room.findById(result.targetRoomId).select('name');
    console.log(`📍 [TRANSFER] Rooms found: ${currentRoom?.name} -> ${targetRoom?.name}`);

    // Tạo thông báo hệ thống cho manager
    console.log(`📬 [TRANSFER] Gọi createSystemNotificationForRequest với data:`, {
      tenantId,
      currentRoomName: currentRoom?.name || 'Phòng không xác định',
      targetRoomName: targetRoom?.name || 'Phòng không xác định',
      reason: req.body.reason,
      transferDate: result.transferDate
    });
    
    await notificationService.createSystemNotificationForRequest(
      tenantId,
      'transfer',
      {
        currentRoomName: currentRoom?.name || 'Phòng không xác định',
        targetRoomName: targetRoom?.name || 'Phòng không xác định',
        reason: req.body.reason,
        transferDate: result.transferDate
      }
    );
    console.log(`✅ [TRANSFER] Hoàn tất tạo notification`);

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

/**
 * [TENANT] Cập nhật yêu cầu chuyển phòng (chỉ khi Pending)
 * PUT /api/requests/transfer/:id
 * Body: { roomId?, targetRoomId?, transferDate?, reason? }
 */
exports.updateTransferRequest = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const result = await transferService.updateTransferRequest(req.params.id, tenantId, req.body);
    res.status(200).json({
      success: true,
      message: "Cập nhật yêu cầu chuyển phòng thành công",
      data: result,
    });
  } catch (error) {
    console.error("Update transfer request error:", error);
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || "Server error" });
  }
};

/**
 * [TENANT] Xóa yêu cầu chuyển phòng (chỉ khi Pending)
 * DELETE /api/requests/transfer/:id
 */
exports.deleteTransferRequest = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const result = await transferService.deleteTransferRequest(req.params.id, tenantId);
    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Delete transfer request error:", error);
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || "Server error" });
  }
};

/**
 * [MANAGER] Lấy danh sách tất cả yêu cầu chuyển phòng
 * GET /api/requests/transfer
 * Query: ?status=Pending&search=abc&page=1&limit=10
 */
exports.getAllTransferRequests = async (req, res) => {
  try {
    const { status, search, page, limit } = req.query || {};
    const result = await transferService.getAllTransferRequestsForManager({ status, search, page, limit });
    res.status(200).json({
      success: true,
      message: "Lấy danh sách yêu cầu chuyển phòng thành công",
      ...result,
    });
  } catch (error) {
    console.error("Get all transfer requests error:", error);
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || "Server error" });
  }
};

/**
 * [MANAGER] Lấy chi tiết yêu cầu chuyển phòng
 * GET /api/requests/transfer/:id
 */
exports.getTransferRequestById = async (req, res) => {
  try {
    const result = await transferService.getTransferRequestById(req.params.id);
    res.status(200).json({ success: true, message: "Lấy chi tiết thành công", data: result });
  } catch (error) {
    console.error("Get transfer request by id error:", error);
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || "Server error" });
  }
};

/**
 * [MANAGER] Duyệt yêu cầu chuyển phòng
 * PATCH /api/requests/transfer/:id/approve
 * Body: { managerNote? }
 */
exports.approveTransferRequest = async (req, res) => {
  try {
    const { managerNote } = req.body || {};
    const result = await transferService.approveTransferRequest(req.params.id, managerNote);
    res.status(200).json({ success: true, message: "Đã duyệt yêu cầu chuyển phòng", data: result });
  } catch (error) {
    console.error("Approve transfer request error:", error);
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || "Server error" });
  }
};

/**
 * [MANAGER] Từ chối yêu cầu chuyển phòng
 * PATCH /api/requests/transfer/:id/reject
 * Body: { rejectReason }
 */
exports.rejectTransferRequest = async (req, res) => {
  try {
    const { rejectReason } = req.body || {};
    const result = await transferService.rejectTransferRequest(req.params.id, rejectReason);
    res.status(200).json({ success: true, message: "Đã từ chối yêu cầu chuyển phòng", data: result });
  } catch (error) {
    console.error("Reject transfer request error:", error);
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || "Server error" });
  }
};

/**
 * [MANAGER] Phát hành hóa đơn chuyển phòng
 * POST /api/requests/transfer/:id/release-invoice
 * Body: { managerInvoiceNotes, electricIndex, waterIndex }
 */
exports.releaseTransferInvoice = async (req, res) => {
  try {
    const { managerInvoiceNotes, electricIndex, waterIndex } = req.body || {};
    const result = await transferService.releaseTransferInvoice(req.params.id, managerInvoiceNotes, electricIndex, waterIndex);
    res.status(200).json({ success: true, message: "Đã phát hành hóa đơn chuyển phòng thành công", data: result });
  } catch (error) {
    console.error("Release transfer invoice error:", error);
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || "Server error" });
  }
};

/**
 * [MANAGER] Hoàn tất chuyển phòng (Bàn giao phòng)
 * PATCH /api/requests/transfer/:id/complete
 * Thực hiện khi ngày chuyển đã tới
 */
exports.completeTransferRequest = async (req, res) => {
  try {
    const result = await transferService.completeTransferRequest(req.params.id);
    res.status(200).json({
      success: true,
      message: "Chuyển phòng hoàn tất thành công",
      data: result,
    });
  } catch (error) {
    console.error("Complete transfer request error:", error);
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};
