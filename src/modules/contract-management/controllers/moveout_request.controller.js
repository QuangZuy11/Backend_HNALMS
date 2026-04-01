const moveOutRequestService = require("../services/moveout_request.service");
const Contract = require("../models/contract.model");

class MoveOutRequestController {
  // ============================================================
  //  TENANT – Tạo yêu cầu trả phòng
  // ============================================================
  /**
   * POST /api/move-outs
   * Body: { contractId, expectedMoveOutDate, reason, confirmContinue? }
   */
  async createMoveOutRequest(req, res) {
    try {
      console.log(`[MOVEOUT CTRL] Tenant tạo yêu cầu trả phòng`);
      const { contractId, expectedMoveOutDate, reason, confirmContinue = false } = req.body;
      const tenantId = req.user?.userId;
      const normalizedConfirm = typeof confirmContinue === 'string'
        ? confirmContinue.trim().toLowerCase()
        : confirmContinue;
      const shouldContinue = normalizedConfirm === true
        || normalizedConfirm === 1
        || normalizedConfirm === "1"
        || normalizedConfirm === "true"
        || normalizedConfirm === "yes"
        || normalizedConfirm === "y";

      if (!contractId || !expectedMoveOutDate) {
        return res.status(400).json({
          success: false,
          message: "Thiếu thông tin bắt buộc: contractId, expectedMoveOutDate"
        });
      }

      const serviceResult = await moveOutRequestService.createMoveOutRequest(
        contractId,
        tenantId,
        expectedMoveOutDate,
        reason,
        shouldContinue
      );

      if (serviceResult?.requiresConfirmation) {
        return res.status(200).json({
          success: false,
          requiresConfirmation: true,
          message: "Yêu cầu xác nhận điều khoản trả phòng trước khi tiếp tục.",
          warnings: serviceResult.warnings,
          data: serviceResult.data
        });
      }

      const moveOutRequest = serviceResult;

      const warnings = [];
      if (moveOutRequest.isEarlyNotice) {
        warnings.push({
          type: "early_notice",
          message: "Bạn đã xác nhận ngày trả phòng chưa đáp ứng tối thiểu 30 ngày báo trước so với ngày kết thúc hợp đồng. Tiền cọc hoàn sẽ được tính = 0 trong hóa đơn tất toán."
        });
      }
      if (moveOutRequest.isUnderMinStay) {
        warnings.push({
          type: "under_min_stay",
          message: "Bạn đã xác nhận thời gian ở tính đến hiện tại chưa đủ tối thiểu 3 tháng (90 ngày). Tiền cọc hoàn sẽ được tính = 0 trong hóa đơn thanh lý."
        });
      }

      return res.status(201).json({
        success: true,
        message: "Yêu cầu trả phòng đã được tạo. Quản lý sẽ liên hệ và phát hành hóa đơn cuối.",
        data: moveOutRequest,
        warnings
      });
    } catch (error) {
      console.error(`[MOVEOUT CTRL] ❌ Lỗi tạo yêu cầu:`, error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  //  TENANT – Lấy thông tin hợp đồng khi ấn "Trả phòng"
  // ============================================================
  /**
   * GET /api/move-outs/contract/:contractId/info
   */
  async getContractInfo(req, res) {
    try {
      const { contractId } = req.params;
      const tenantId = req.user?.userId;

      const contract = await Contract.findById(contractId)
        .populate('roomId', 'name roomCode floorId')
        .select('_id contractCode startDate endDate tenantId roomId status duration');

      if (!contract) return res.status(404).json({ success: false, message: "Không tìm thấy hợp đồng" });
      if (contract.tenantId.toString() !== String(tenantId))
        return res.status(403).json({ success: false, message: "Bạn không có quyền xem hợp đồng này" });
      if (contract.status !== "active")
        return res.status(400).json({ success: false, message: "Hợp đồng không ở trạng thái hoạt động" });

      return res.status(200).json({
        success: true,
        data: {
          contractId: contract._id,
          contractCode: contract.contractCode,
          startDate: contract.startDate,
          endDate: contract.endDate,
          duration: contract.duration,
          roomName: contract.roomId?.name,
          roomCode: contract.roomId?.roomCode
        }
      });
    } catch (error) {
      console.error(`[MOVEOUT CTRL] ❌ Lỗi lấy contract info:`, error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  //  TENANT – Lấy yêu cầu trả phòng của mình
  // ============================================================
  /**
   * GET /api/move-outs/my/:contractId
   */
  async getMyMoveOutRequest(req, res) {
    try {
      const { contractId } = req.params;
      const tenantId = req.user?.userId;

      const contract = await Contract.findById(contractId);
      if (!contract || contract.tenantId.toString() !== String(tenantId))
        return res.status(403).json({ success: false, message: "Bạn không có quyền truy cập tài nguyên này" });

      const moveOutRequest = await moveOutRequestService.getMoveOutRequestByContractId(contractId);

      if (!moveOutRequest)
        return res.status(200).json({ success: true, data: null, message: "Hợp đồng này chưa có yêu cầu trả phòng" });

      return res.status(200).json({ success: true, data: moveOutRequest });
    } catch (error) {
      console.error(`[MOVEOUT CTRL] ❌ Lỗi:`, error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  //  MANAGER – Lấy danh sách yêu cầu trả phòng
  // ============================================================
  /**
   * GET /api/move-outs/list?status=Requested&page=1&limit=20
   */
  async getAllMoveOutRequests(req, res) {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const result = await moveOutRequestService.getAllMoveOutRequests(
        status, parseInt(page), parseInt(limit)
      );
      return res.status(200).json({
        success: true,
        data: result.moveOutRequests,
        pagination: result.pagination
      });
    } catch (error) {
      console.error(`[MOVEOUT CTRL] ❌ Lỗi lấy danh sách:`, error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  //  MANAGER – Lấy chi tiết một yêu cầu
  // ============================================================
  /**
   * GET /api/move-outs/:moveOutRequestId
   */
  async getMoveOutRequestById(req, res) {
    try {
      const { moveOutRequestId } = req.params;
      const data = await moveOutRequestService.getMoveOutRequestById(moveOutRequestId);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error(`[MOVEOUT CTRL] ❌ Lỗi lấy chi tiết:`, error.message);
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  //  MANAGER – Phát hành hóa đơn cuối (sau khi kiểm tra phòng)
  // ============================================================
  /**
   * POST /api/move-outs/:moveOutRequestId/release-invoice
   * Body: { managerInvoiceNotes, electricIndex, waterIndex }
   */
  async releaseFinalInvoice(req, res) {
    try {
      console.log(`[MOVEOUT CTRL] Manager phát hành hóa đơn cuối`);
      const { moveOutRequestId } = req.params;
      const { managerInvoiceNotes = "", electricIndex, waterIndex } = req.body;

      let elecIdx = electricIndex !== undefined && electricIndex !== null && electricIndex !== '' ? Number(electricIndex) : undefined;
      let waterIdx = waterIndex !== undefined && waterIndex !== null && waterIndex !== '' ? Number(waterIndex) : undefined;

      const result = await moveOutRequestService.releaseFinalInvoice(
        moveOutRequestId, managerInvoiceNotes, elecIdx, waterIdx
      );

      return res.status(200).json({
        success: true,
        message: "Hóa đơn cuối đã được phát hành. Tenant sẽ được thông báo.",
        data: result
      });
    } catch (error) {
      console.error(`[MOVEOUT CTRL] ❌ Lỗi phát hành hóa đơn:`, error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  //  SYSTEM – So sánh tiền cọc vs hóa đơn cuối
  // ============================================================
  /**
   * GET /api/move-outs/:moveOutRequestId/deposit-vs-invoice
   */
  async getDepositVsInvoice(req, res) {
    try {
      const { moveOutRequestId } = req.params;
      const result = await moveOutRequestService.getDepositVsInvoice(moveOutRequestId);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error(`[MOVEOUT CTRL] ❌ Lỗi so sánh cọc/hóa đơn:`, error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  //  MANAGER – Kiểm tra trạng thái thanh toán
  // ============================================================
  /**
   * GET /api/move-outs/:moveOutRequestId/check-payment-status
   */
  async checkPaymentStatus(req, res) {
    try {
      console.log(`[MOVEOUT CTRL] Manager kiểm tra trạng thái thanh toán`);
      const { moveOutRequestId } = req.params;

      const result = await moveOutRequestService.checkPaymentStatus(moveOutRequestId);

      return res.status(200).json({
        success: true,
        message: result.isPaid ? "Tenant đã thanh toán." : "Tenant chưa thanh toán.",
        data: result
      });
    } catch (error) {
      console.error(`[MOVEOUT CTRL] ❌ Lỗi kiểm tra thanh toán:`, error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  //  MANAGER – Hoàn tất trả phòng (sau khi đã Paid)
  // ============================================================
  /**
   * PUT /api/move-outs/:moveOutRequestId/complete
   * Body: { managerCompletionNotes }
   */
  async completeMoveOut(req, res) {
    try {
      console.log(`[MOVEOUT CTRL] Manager hoàn tất trả phòng`);
      const { moveOutRequestId } = req.params;
      const { managerCompletionNotes = "" } = req.body;

      const result = await moveOutRequestService.completeMoveOut(
        moveOutRequestId, managerCompletionNotes
      );

      return res.status(200).json({
        success: true,
        message: "Trả phòng hoàn tất. Hợp đồng đã terminated, tài khoản tenant đã inactive.",
        data: result
      });
    } catch (error) {
      console.error(`[MOVEOUT CTRL] ❌ Lỗi hoàn tất:`, error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

}

module.exports = new MoveOutRequestController();
