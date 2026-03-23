const MoveOutRequest = require("../models/moveout_request.model");
const Contract = require("../models/contract.model");
const User = require("../../authentication/models/user.model");
const notificationService = require("../../notification-management/services/notification.service");

class MoveOutRequestService {
  /**
   * Tạo yêu cầu trả phòng mới
   * @param {string} contractId - ID của hợp đồng
   * @param {string} tenantId - ID của tenant
   * @param {Date} expectedMoveOutDate - Ngày trả phòng dự kiến
   * @param {string} reason - Lý do trả phòng
   * @returns {Object} MoveOutRequest
   */
  async createMoveOutRequest(contractId, tenantId, expectedMoveOutDate, reason) {
    try {
      console.log(`[MOVEOUT SERVICE] 📋 Bắt đầu tạo yêu cầu trả phòng...`);
      console.log(`[MOVEOUT SERVICE] Params: contractId=${contractId}, tenantId=${tenantId}, expectedMoveOutDate=${expectedMoveOutDate}`);

      // 1. Kiểm tra hợp đồng tồn tại
      const contract = await Contract.findById(contractId)
        .populate('tenantId', 'fullName email phoneNumber')
        .populate('roomId', 'name roomCode');

      if (!contract) {
        throw new Error("Không tìm thấy hợp đồng");
      }

      if (contract.status !== "active") {
        throw new Error(`Hợp đồng không ở trạng thái hoạt động (trạng thái hiện tại: ${contract.status})`);
      }

      // 2. Kiểm tra tenant khớp (convert cả 2 thành string để so sánh)
      if (contract.tenantId._id.toString() !== String(tenantId)) {
        console.warn(`[MOVEOUT SERVICE] ⚠️ Tenant không khớp: contract.tenantId=${contract.tenantId._id.toString()}, userId=${String(tenantId)}`);
        throw new Error("Bạn không có quyền tạo yêu cầu trả phòng cho hợp đồng này");
      }

      // 3. Kiểm tra nếu đã có yêu cầu trả phòng chưa hoàn tất
      const existingRequest = await MoveOutRequest.findOne({
        contractId,
        status: { $in: ["Requested", "Approved", "InProcess"] }
      });

      if (existingRequest) {
        throw new Error("Yêu cầu trả phòng đã được tạo trước đó và chưa hoàn tất");
      }

      // 4. Kiểm tra unhappy case
      const now = new Date();
      const daysUntilMoveOut = Math.ceil(
        (expectedMoveOutDate - now) / (1000 * 60 * 60 * 24)
      );
      const isEarlyNotice = daysUntilMoveOut < 30;

      // Tính thời gian ở
      const stayDuration = Math.ceil(
        (expectedMoveOutDate - contract.startDate) / (1000 * 60 * 60 * 24 * 30)
      ); // Tính theo tháng
      const isUnderMinStay = stayDuration < 3;

      console.log(`[MOVEOUT SERVICE] ⚠️ Kiểm tra unhappy case:`);
      console.log(`[MOVEOUT SERVICE] - Số ngày còn lại: ${daysUntilMoveOut} (< 30? ${isEarlyNotice})`);
      console.log(`[MOVEOUT SERVICE] - Thời gian ở: ${stayDuration} tháng (< 3? ${isUnderMinStay})`);

      // 5. Tạo MoveOutRequest
      const moveOutRequest = new MoveOutRequest({
        contractId,
        tenantId,
        expectedMoveOutDate,
        reason,
        requestDate: now,
        isEarlyNotice,
        isUnderMinStay,
        isDepositForfeited: isEarlyNotice || isUnderMinStay, // Tự động đặt mất cọc nếu unhappy case
        status: "Requested"
      });

      await moveOutRequest.save();

      console.log(`[MOVEOUT SERVICE] ✅ Yêu cầu trả phòng đã tạo: ${moveOutRequest._id}`);

      // 6. Gửi thông báo cho quản lý
      const managers = await User.find({
        role: 'manager',
        status: 'active'
      }).select('_id');

      if (managers.length > 0) {
        try {
          const title = `📋 Yêu cầu trả phòng từ ${contract.tenantId.fullName}`;
          const content = `Phòng: ${contract.roomId.name}\nNgày trả phòng dự kiến: ${new Date(expectedMoveOutDate).toLocaleDateString('vi-VN')}\nLý do: ${reason || 'Không có'}\n\nVui lòng kiểm tra và phê duyệt yêu cầu này.`;

          await notificationService.createSystemNotificationForRequest(tenantId, 'moveout', {
            description: title,
            roomName: contract.roomId.name,
            reason: reason
          });

          console.log(`[MOVEOUT SERVICE] ✅ Thông báo đã gửi cho ${managers.length} quản lý`);
        } catch (notifError) {
          console.error(`[MOVEOUT SERVICE] ⚠️ Lỗi gửi thông báo:`, notifError.message);
        }
      }

      return moveOutRequest;
    } catch (error) {
      console.error(`[MOVEOUT SERVICE] ❌ Lỗi tạo yêu cầu trả phòng:`, error.message);
      throw error;
    }
  }

  /**
   * Lấy yêu cầu trả phòng theo ID
   */
  async getMoveOutRequestById(moveOutRequestId) {
    try {
      const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId)
        .populate('tenantId', 'fullName email');

      if (!moveOutRequest) {
        throw new Error("Không tìm thấy yêu cầu trả phòng");
      }

      return moveOutRequest;
    } catch (error) {
      throw new Error(`Lỗi lấy yêu cầu trả phòng: ${error.message}`);
    }
  }

  /**
   * Lấy yêu cầu trả phòng theo contract ID
   */
  async getMoveOutRequestByContractId(contractId) {
    try {
      console.log(`[MOVEOUT SERVICE] Kiểm tra MoveOutRequest cho contract: ${contractId}`);
      
      // Không dùng populate để tránh lỗi circular dependency
      // Chỉ select những field cần thiết
      const moveOutRequest = await MoveOutRequest.findOne({ contractId });

      if (!moveOutRequest) {
        console.log(`[MOVEOUT SERVICE] No existing move-out request for contract: ${contractId}`);
        return null;
      }

      console.log(`[MOVEOUT SERVICE] ✅ Tìm thấy moveOutRequest: ${moveOutRequest._id}`);
      return moveOutRequest;
    } catch (error) {
      console.error(`[MOVEOUT SERVICE] ❌ Lỗi lấy yêu cầu trả phòng:`, error.message);
      throw new Error(`Lỗi lấy yêu cầu trả phòng: ${error.message}`);
    }
  }

  /**
   * Lấy danh sách yêu cầu trả phòng (cho quản lý)
   */
  async getAllMoveOutRequests(status, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      if (status) {
        query.status = status;
      }

      const moveOutRequests = await MoveOutRequest.find(query)
        .populate('tenantId', 'fullName email phoneNumber')
        .sort({ requestDate: -1 })
        .skip(skip)
        .limit(limit);

      const total = await MoveOutRequest.countDocuments(query);

      return {
        moveOutRequests,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalCount: total,
          limit
        }
      };
    } catch (error) {
      throw new Error(`Lỗi lấy danh sách yêu cầu trả phòng: ${error.message}`);
    }
  }

  /**
   * Quản lý phê duyệt yêu cầu trả phòng
   */
  async approveMoveOutRequest(moveOutRequestId, managerNotes = "") {
    try {
      console.log(`[MOVEOUT SERVICE] 📝 Quản lý phê duyệt yêu cầu trả phòng: ${moveOutRequestId}`);

      const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId)
        .populate('tenantId', 'email fullName');

      if (!moveOutRequest) {
        throw new Error("Không tìm thấy yêu cầu trả phòng");
      }

      if (moveOutRequest.status !== "Requested") {
        throw new Error(`Yêu cầu không ở trạng thái 'Requested' (trạng thái hiện tại: ${moveOutRequest.status})`);
      }

      // Cập nhật trạng thái
      moveOutRequest.status = "Approved";
      moveOutRequest.managerApprovalDate = new Date();
      moveOutRequest.managerApprovalNotes = managerNotes;

      await moveOutRequest.save();

      console.log(`[MOVEOUT SERVICE] ✅ Yêu cầu trả phòng đã được phê duyệt`);

      // Gửi thông báo cho tenant
      try {
        const expectedDate = new Date(moveOutRequest.expectedMoveOutDate).toLocaleDateString('vi-VN');
        const title = `✅ Yêu cầu trả phòng đã được phê duyệt`;
        const content = `Quản lý đã phê duyệt yêu cầu trả phòng của bạn.\n\nNgày bàn giao phòng: ${expectedDate}\n\nVui lòng bàn giao phòng cho Quản Lý vào ngày này.\n\nGhi chú: ${managerNotes || 'Không có'}`;

        // Tạo thông báo hệ thống cho tenant
        const notification = new (require('../../notification-management/models/notification.model'))({
          title,
          content,
          type: 'system',
          status: 'sent',
          recipients: [{
            recipient_id: moveOutRequest.tenantId._id,
            recipient_role: 'tenant',
            is_read: false
          }]
        });

        await notification.save();
        console.log(`[MOVEOUT SERVICE] ✅ Thông báo phê duyệt đã gửi cho tenant`);
      } catch (notifError) {
        console.warn(`[MOVEOUT SERVICE] ⚠️ Lỗi gửi thông báo:`, notifError.message);
      }

      return moveOutRequest;
    } catch (error) {
      console.error(`[MOVEOUT SERVICE] ❌ Lỗi phê duyệt yêu cầu:`, error.message);
      throw error;
    }
  }

  /**
   * Quản lý xác nhận hoàn tất trả phòng (sau khi tính hóa đơn tất toán)
   */
  async completeMoveOut(moveOutRequestId, finalSettlementInvoiceId, managerCompletionNotes = "") {
    try {
      console.log(`[MOVEOUT SERVICE] 🏁 Hoàn tất trả phòng: ${moveOutRequestId}`);

      const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId)
        .populate('tenantId', 'email fullName username');

      if (!moveOutRequest) {
        throw new Error("Không tìm thấy yêu cầu trả phòng");
      }

      if (moveOutRequest.status !== "InProcess" && moveOutRequest.status !== "Approved") {
        throw new Error(`Yêu cầu không ở trạng thái có thể hoàn tất (trạng thái hiện tại: ${moveOutRequest.status})`);
      }

      // Cập nhật
      moveOutRequest.status = "Completed";
      moveOutRequest.completedDate = new Date();
      moveOutRequest.finalSettlementInvoiceId = finalSettlementInvoiceId;
      moveOutRequest.managerCompletionNotes = managerCompletionNotes;

      await moveOutRequest.save();

      console.log(`[MOVEOUT SERVICE] ✅ Trả phòng đã hoàn tất`);

      // Cập nhật trạng thái hợp đồng
      const contract = await Contract.findById(moveOutRequest.contractId);
      contract.status = "terminated";
      await contract.save();

      console.log(`[MOVEOUT SERVICE] ✅ Hợp đồng đã được đóng (terminated)`);

      // Vô hiệu hóa tài khoản tenant
      const tenant = moveOutRequest.tenantId;
      tenant.status = "inactive";
      await tenant.save();

      console.log(`[MOVEOUT SERVICE] ✅ Tài khoản tenant đã được vô hiệu hóa`);

      // Gửi thông báo cho tenant
      try {
        const title = `🎉 Trả phòng đã hoàn tất`;
        const content = `Quản lý đã xác nhận hoàn tất quá trình trả phòng.\n\nGhi chú: ${managerCompletionNotes || 'Không có'}\n\nCảm ơn bạn đã sử dụng dịch vụ của chúng tôi!`;

        const notification = new (require('../../notification-management/models/notification.model'))({
          title,
          content,
          type: 'system',
          status: 'sent',
          recipients: [{
            recipient_id: tenant._id,
            recipient_role: 'tenant',
            is_read: false
          }]
        });

        await notification.save();
        console.log(`[MOVEOUT SERVICE] ✅ Thông báo hoàn tất đã gửi cho tenant`);
      } catch (notifError) {
        console.warn(`[MOVEOUT SERVICE] ⚠️ Lỗi gửi thông báo:`, notifError.message);
      }

      return moveOutRequest;
    } catch (error) {
      console.error(`[MOVEOUT SERVICE] ❌ Lỗi hoàn tất trả phòng:`, error.message);
      throw error;
    }
  }

  /**
   * Hủy yêu cầu trả phòng
   */
  async cancelMoveOutRequest(moveOutRequestId, reason = "") {
    try {
      console.log(`[MOVEOUT SERVICE] ❌ Hủy yêu cầu trả phòng: ${moveOutRequestId}`);

      const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);

      if (!moveOutRequest) {
        throw new Error("Không tìm thấy yêu cầu trả phòng");
      }

      if (!["Requested", "Approved"].includes(moveOutRequest.status)) {
        throw new Error(`Chỉ có thể hủy yêu cầu ở trạng thái 'Requested' hoặc 'Approved'`);
      }

      moveOutRequest.status = "Cancelled";
      await moveOutRequest.save();

      console.log(`[MOVEOUT SERVICE] ✅ Yêu cầu trả phòng đã hủy`);

      return moveOutRequest;
    } catch (error) {
      console.error(`[MOVEOUT SERVICE] ❌ Lỗi hủy yêu cầu:`, error.message);
      throw error;
    }
  }
}

module.exports = new MoveOutRequestService();
