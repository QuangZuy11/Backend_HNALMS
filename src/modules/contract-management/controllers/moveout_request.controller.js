const moveOutRequestService = require("../services/moveout_request.service");
const Contract = require("../models/contract.model");

class MoveOutRequestController {
  /**
   * Tenant tạo yêu cầu trả phòng
   * Body: {
   *   contractId: string,
   *   expectedMoveOutDate: Date,
   *   reason: string
   * }
   */
  async createMoveOutRequest(req, res) {
    try {
      console.log(`[MOVEOUT CONTROLLER] 📋 Tenant tạo yêu cầu trả phòng...`);

      const { contractId, expectedMoveOutDate, reason } = req.body;
      const tenantId = req.user?.userId;

      // Validate
      if (!contractId || !expectedMoveOutDate) {
        return res.status(400).json({
          success: false,
          message: "Thiếu thông tin yêu cầu (contractId, expectedMoveOutDate)"
        });
      }

      if (new Date(expectedMoveOutDate) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "Ngày trả phòng phải trong tương lai"
        });
      }

      // Gọi service
      const moveOutRequest = await moveOutRequestService.createMoveOutRequest(
        contractId,
        tenantId,
        new Date(expectedMoveOutDate),
        reason
      );

      // Return unhappy case warnings để FE có thể show cảnh báo
      const warnings = [];
      if (moveOutRequest.isEarlyNotice) {
        warnings.push({
          type: "early_notice",
          message: "Bạn đang báo trả phòng gấp (dưới 1 tháng). Theo điều khoản hợp đồng, bạn có thể bị mất cọc."
        });
      }
      if (moveOutRequest.isUnderMinStay) {
        warnings.push({
          type: "under_min_stay",
          message: "Bạn sẽ không được hoàn cọc vì thời gian ở chưa đủ 3 tháng."
        });
      }

      console.log(`[MOVEOUT CONTROLLER] ✅ Yêu cầu trả phòng đã tạo`);

      res.status(201).json({
        success: true,
        message: "Yêu cầu trả phòng đã được tạo",
        data: moveOutRequest,
        warnings: warnings
      });
    } catch (error) {
      console.error(`[MOVEOUT CONTROLLER] ❌ Lỗi:`, error.message);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Tenant lấy thông tin hợp đồng khi ấn nút "Trả phòng"
   * Params: contractId
   */
  async getContractInfo(req, res) {
    try {
      console.log(`[MOVEOUT CONTROLLER] 📄 Lấy thông tin hợp đồng...`);

      const { contractId } = req.params;
      const tenantId = req.user?.userId;

      if (!tenantId) {
        return res.status(401).json({
          success: false,
          message: "Bạn chưa đăng nhập"
        });
      }

      const contract = await Contract.findById(contractId)
        .populate('roomId', 'name roomCode floorId')
        .select('_id contractCode startDate endDate tenantId roomId status');

      if (!contract) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy hợp đồng"
        });
      }

      // Kiểm tra tenant khớp (convert cả 2 thành string để so sánh)
      if (contract.tenantId.toString() !== String(tenantId)) {
        console.warn(`[MOVEOUT CONTROLLER] ⚠️ Tenant không khớp: contract.tenantId=${contract.tenantId.toString()}, userId=${String(tenantId)}`);
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xem hợp đồng này"
        });
      }

      if (contract.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "Hợp đồng không ở trạng thái hoạt động"
        });
      }

      console.log(`[MOVEOUT CONTROLLER] ✅ Lấy thông tin hợp đồng thành công`);

      res.status(200).json({
        success: true,
        data: {
          contractId: contract._id,
          contractCode: contract.contractCode,
          startDate: contract.startDate,
          endDate: contract.endDate,
          roomName: contract.roomId.name,
          roomCode: contract.roomId.roomCode
        }
      });
    } catch (error) {
      console.error(`[MOVEOUT CONTROLLER] ❌ Lỗi:`, error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Tenant lấy yêu cầu trả phòng của mình
   */
  async getMyMoveOutRequest(req, res) {
    try {
      console.log(`[MOVEOUT CONTROLLER] 📋 Tenant lấy yêu cầu trả phòng của mình...`);

      const { contractId } = req.params;
      const tenantId = req.user?.userId;

      // Verify tenant ownership
      const contract = await Contract.findById(contractId);
      if (!contract || contract.tenantId.toString() !== String(tenantId)) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền truy cập tài nguyên này"
        });
      }

      const moveOutRequest = await moveOutRequestService.getMoveOutRequestByContractId(contractId);

      if (!moveOutRequest) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy yêu cầu trả phòng"
        });
      }

      console.log(`[MOVEOUT CONTROLLER] ✅ Lấy yêu cầu thành công`);

      res.status(200).json({
        success: true,
        data: moveOutRequest
      });
    } catch (error) {
      console.error(`[MOVEOUT CONTROLLER] ❌ Lỗi:`, error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Quản lý lấy danh sách yêu cầu trả phòng
   */
  async getAllMoveOutRequests(req, res) {
    try {
      console.log(`[MOVEOUT CONTROLLER] 📋 Quản lý lấy danh sách yêu cầu trả phòng...`);

      const { status, page = 1, limit = 20 } = req.query;

      const result = await moveOutRequestService.getAllMoveOutRequests(
        status,
        parseInt(page),
        parseInt(limit)
      );

      console.log(`[MOVEOUT CONTROLLER] ✅ Lấy danh sách thành công`);

      res.status(200).json({
        success: true,
        data: result.moveOutRequests,
        pagination: result.pagination
      });
    } catch (error) {
      console.error(`[MOVEOUT CONTROLLER] ❌ Lỗi:`, error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Quản lý phê duyệt yêu cầu trả phòng
   * Body: {
   *   managerApprovalNotes: string (optional)
   * }
   */
  async approveMoveOutRequest(req, res) {
    try {
      console.log(`[MOVEOUT CONTROLLER] ✅ Quản lý phê duyệt yêu cầu...`);

      const { moveOutRequestId } = req.params;
      const { managerApprovalNotes = "" } = req.body;

      const result = await moveOutRequestService.approveMoveOutRequest(
        moveOutRequestId,
        managerApprovalNotes
      );

      console.log(`[MOVEOUT CONTROLLER] ✅ Phê duyệt thành công`);

      res.status(200).json({
        success: true,
        message: "Yêu cầu trả phòng đã được phê duyệt",
        data: result
      });
    } catch (error) {
      console.error(`[MOVEOUT CONTROLLER] ❌ Lỗi:`, error.message);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Quản lý xác nhận hoàn tất trả phòng (sau khi tính hóa đơn tất toán)
   * Body: {
   *   finalSettlementInvoiceId: string,
   *   managerCompletionNotes: string (optional)
   * }
   */
  async completeMoveOut(req, res) {
    try {
      console.log(`[MOVEOUT CONTROLLER] 🏁 Quản lý hoàn tất trả phòng...`);

      const { moveOutRequestId } = req.params;
      const { finalSettlementInvoiceId, managerCompletionNotes = "" } = req.body;

      if (!finalSettlementInvoiceId) {
        return res.status(400).json({
          success: false,
          message: "Thiếu finalSettlementInvoiceId"
        });
      }

      const result = await moveOutRequestService.completeMoveOut(
        moveOutRequestId,
        finalSettlementInvoiceId,
        managerCompletionNotes
      );

      console.log(`[MOVEOUT CONTROLLER] ✅ Hoàn tất thành công`);

      res.status(200).json({
        success: true,
        message: "Trả phòng đã được hoàn tất. Hợp đồng đã được đóng.",
        data: result
      });
    } catch (error) {
      console.error(`[MOVEOUT CONTROLLER] ❌ Lỗi:`, error.message);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Hủy yêu cầu trả phòng (Tenant hoặc Manager)
   */
  async cancelMoveOutRequest(req, res) {
    try {
      console.log(`[MOVEOUT CONTROLLER] ❌ Hủy yêu cầu trả phòng...`);

      const { moveOutRequestId } = req.params;
      const { reason = "" } = req.body;

      const result = await moveOutRequestService.cancelMoveOutRequest(
        moveOutRequestId,
        reason
      );

      console.log(`[MOVEOUT CONTROLLER] ✅ Hủy thành công`);

      res.status(200).json({
        success: true,
        message: "Yêu cầu trả phòng đã được hủy",
        data: result
      });
    } catch (error) {
      console.error(`[MOVEOUT CONTROLLER] ❌ Lỗi:`, error.message);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new MoveOutRequestController();
