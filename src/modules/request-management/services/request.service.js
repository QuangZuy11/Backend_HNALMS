const RepairRequest = require("../models/repair_requests.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
const Device = require("../../room-floor-management/models/devices.model");

/**
 * Lấy danh sách yêu cầu sửa chữa (chỉ dành cho manager)
 * @returns {Array} Danh sách repair requests với thông tin tenant và device
 */
const getRepairRequests = async () => {
  try {
    const repairRequests = await RepairRequest.find({})
      .populate({
        path: "tenantId",
        select: "username email phoneNumber role",
        model: User, // Tenant có thể là User với role Tenant
      })
      .populate({
        path: "devicesId",
        select: "name brand model description",
        model: Device,
      })
      .sort({ createdDate: -1 }) // Sắp xếp mới nhất trước
      .lean();

    // Populate thêm UserInfo để lấy fullname cho mỗi tenant
    for (let request of repairRequests) {
      if (request.tenantId) {
        const userInfo = await UserInfo.findOne({ userId: request.tenantId._id }).lean();
        if (userInfo) {
          request.tenantId.fullname = userInfo.fullname || null;
        }
      }
    }

    return repairRequests;
  } catch (error) {
    console.error("Error getting repair requests:", error);
    throw new Error("Không thể lấy danh sách yêu cầu sửa chữa");
  }
};

/**
 * Cập nhật trạng thái yêu cầu sửa chữa
 * @param {string} requestId - ID của yêu cầu
 * @param {"Pending"|"Processing"|"Done"} status - Trạng thái mới
 */
const updateRepairRequestStatus = async (requestId, status) => {
  const allowedStatus = ["Pending", "Processing", "Done"];
  if (!allowedStatus.includes(status)) {
    throw new Error("Trạng thái không hợp lệ");
  }

  const request = await RepairRequest.findById(requestId);
  if (!request) {
    throw new Error("Yêu cầu sửa chữa không tồn tại");
  }

  request.status = status;
  await request.save();

  return request;
};

module.exports = {
  getRepairRequests,
  updateRepairRequestStatus,
};
