const MoveOutRequest = require("../models/moveout_request.model");
const Contract = require("../models/contract.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
const Notification = require("../../notification-management/models/notification.model");

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

      // 3. Kiểm tra nếu đã có yêu cầu trả phòng (mỗi hợp đồng chỉ được 1 yêu cầu duy nhất)
      const existingRequest = await MoveOutRequest.findOne({ contractId });

      if (existingRequest) {
        throw new Error("Hợp đồng này đã có yêu cầu trả phòng trước đó. Mỗi hợp đồng chỉ được tạo một yêu cầu trả phòng.");
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
          // Lấy fullName từ UserInfo để hiển thị trong thông báo
          const userInfo = await UserInfo.findOne({ userId: tenantId }).select('fullname');
          const tenantFullName = userInfo?.fullname || contract.tenantId?.email || 'Tenant';

          const title = `📋 Yêu cầu trả phòng từ ${tenantFullName}`;
          const content = `Phòng: ${contract.roomId?.name || 'N/A'}
Ngày trả phòng dự kiến: ${new Date(expectedMoveOutDate).toLocaleDateString('vi-VN')}
Lý do: ${reason || 'Không có'}

Vui lòng kiểm tra và xử lý yêu cầu này.`;

          const notification = new Notification({
            title,
            content,
            type: 'system',
            status: 'sent',
            created_by: null,
            recipients: managers.map(m => ({
              recipient_id: m._id,
              recipient_role: 'manager',
              is_read: false,
              read_at: null
            }))
          });
          await notification.save();
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

      // Ensure Room model is registered for nested populate
      require('../../room-floor-management/models/room.model');

      const moveOutRequests = await MoveOutRequest.find(query)
        .populate({
          path: 'contractId',
          select: 'roomId startDate endDate contractCode status depositId',
          populate: { path: 'roomId', select: 'name roomCode floorId' }
        })
        .populate('tenantId', 'email phoneNumber username')
        .sort({ requestDate: -1 })
        .skip(skip)
        .limit(limit);

      const total = await MoveOutRequest.countDocuments(query);

      // Lấy fullname từ UserInfo cho từng tenant
      const tenantIds = moveOutRequests
        .filter(r => r.tenantId && r.tenantId._id)
        .map(r => r.tenantId._id);

      const userInfoList = await UserInfo.find({ userId: { $in: tenantIds } }).select('userId fullname');
      const userInfoMap = {};
      userInfoList.forEach(ui => {
        userInfoMap[ui.userId.toString()] = ui.fullname;
      });

      const enrichedRequests = moveOutRequests.map(r => {
        const obj = r.toObject();
        if (obj.tenantId && obj.tenantId._id) {
          obj.tenantId.fullName = userInfoMap[obj.tenantId._id.toString()] || '';
        }
        return obj;
      });

      return {
        moveOutRequests: enrichedRequests,
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
   * Quản lý xác nhận hoàn tất trả phòng
   */
  async completeMoveOut(moveOutRequestId, managerCompletionNotes = "") {
    try {
      console.log(`[MOVEOUT SERVICE] 🏁 Hoàn tất trả phòng: ${moveOutRequestId}`);

      const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);

      if (!moveOutRequest) {
        throw new Error("Không tìm thấy yêu cầu trả phòng");
      }

      if (!['Requested'].includes(moveOutRequest.status)) {
        throw new Error(`Chỉ có thể xác nhận hoàn tất khi yêu cầu đang ở trạng thái 'Requested' (trạng thái hiện tại: ${moveOutRequest.status})`);
      }

      // 1. Cập nhật moveOutRequest
      moveOutRequest.status = "Completed";
      moveOutRequest.completedDate = new Date();
      moveOutRequest.managerCompletionNotes = managerCompletionNotes;
      await moveOutRequest.save();

      console.log(`[MOVEOUT SERVICE] ✅ Trả phòng đã hoàn tất`);

      // 2. Đóng hợp đồng
      const contract = await Contract.findById(moveOutRequest.contractId);
      if (contract) {
        contract.status = "terminated";
        await contract.save();
        console.log(`[MOVEOUT SERVICE] ✅ Hợp đồng đã được đóng (terminated)`);
      }

      // 3. Vô hiệu hóa tài khoản tenant
      const tenant = await User.findById(moveOutRequest.tenantId);
      if (tenant) {
        tenant.status = "inactive";
        await tenant.save();
        console.log(`[MOVEOUT SERVICE] ✅ Tài khoản tenant đã được vô hiệu hóa`);
      }

      // 4. Gửi thông báo cho tenant
      try {
        const title = `🎉 Trả phòng hoàn tất`;
        const content = `Quản lý đã xác nhận hoàn tất quá trình trả phòng.\n\nGhi chú: ${managerCompletionNotes || 'Không có'}\n\nCảm ơn bạn đã sử dụng dịch vụ của chúng tôi!`;

        const notification = new Notification({
          title,
          content,
          type: 'system',
          status: 'sent',
          created_by: null,
          recipients: [{
            recipient_id: moveOutRequest.tenantId,
            recipient_role: 'tenant',
            is_read: false,
            read_at: null
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

      if (moveOutRequest.status !== 'Requested') {
        throw new Error(`Chỉ có thể hủy yêu cầu đang ở trạng thái 'Requested' (trạng thái hiện tại: ${moveOutRequest.status})`);
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
