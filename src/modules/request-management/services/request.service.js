const RepairRequest = require("../models/repair_requests.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
const Device = require("../../room-floor-management/models/devices.model");

/**
 * Tạo yêu cầu sửa chữa/bảo trì mới
 * @param {Object} data - Dữ liệu yêu cầu
 * @returns {Object} Yêu cầu vừa tạo
 */
const createRepairRequest = async (data) => {
  const { tenantId, devicesId, type, description, images } = data;

  // Kiểm tra device có tồn tại không
  const device = await Device.findById(devicesId);
  if (!device) {
    throw new Error("Thiết bị không tồn tại");
  }

  // Kiểm tra tenant có tồn tại không
  const tenant = await User.findById(tenantId);
  if (!tenant) {
    throw new Error("Người dùng không tồn tại");
  }

  // Tạo yêu cầu mới
  const newRequest = new RepairRequest({
    tenantId,
    devicesId,
    type,
    description,
    images: images || [],
    status: "Pending",
    createdDate: new Date(),
  });

  await newRequest.save();

  // Populate thông tin để trả về
  const populatedRequest = await RepairRequest.findById(newRequest._id)
    .populate({
      path: "tenantId",
      select: "username email phoneNumber role",
      model: User,
    })
    .populate({
      path: "devicesId",
      select: "name brand model category unit price description",
      model: Device,
    })
    .lean();

  return populatedRequest;
};

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
        select: "name brand model category unit price description",
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

      // Format device info để hiển thị đầy đủ thông tin
      if (request.devicesId) {
        request.device = {
          _id: request.devicesId._id,
          name: request.devicesId.name,
          brand: request.devicesId.brand || "N/A",
          model: request.devicesId.model || "N/A",
          category: request.devicesId.category || "N/A",
          unit: request.devicesId.unit || "Cái",
          price: request.devicesId.price || 0,
          description: request.devicesId.description || "",
        };
      }
    }

    return repairRequests;
  } catch (error) {
    console.error("Error getting repair requests:", error);
    throw new Error("Không thể lấy danh sách yêu cầu sửa chữa");
  }
};

/**
 * Lấy danh sách yêu cầu sửa chữa của một tenant cụ thể
 * @param {string} tenantId - ID của tenant
 * @returns {Array} Danh sách repair requests của tenant
 */
const getRepairRequestsByTenant = async (tenantId) => {
  try {
    const repairRequests = await RepairRequest.find({ tenantId })
      .populate({
        path: "devicesId",
        select: "name brand model category unit price description",
        model: Device,
      })
      .sort({ createdDate: -1 }) // Sắp xếp mới nhất trước
      .lean();

    // Format device info
    for (let request of repairRequests) {
      if (request.devicesId) {
        request.device = {
          _id: request.devicesId._id,
          name: request.devicesId.name,
          brand: request.devicesId.brand || "N/A",
          model: request.devicesId.model || "N/A",
          category: request.devicesId.category || "N/A",
          unit: request.devicesId.unit || "Cái",
          price: request.devicesId.price || 0,
          description: request.devicesId.description || "",
        };
      }
    }

    return repairRequests;
  } catch (error) {
    console.error("Error getting repair requests by tenant:", error);
    throw new Error("Không thể lấy danh sách yêu cầu sửa chữa");
  }
};

/**
 * Cập nhật trạng thái yêu cầu sửa chữa
 * @param {string} requestId - ID của yêu cầu
 * @param {"Pending"|"Processing"|"Done"} status - Trạng thái mới
 * @param {number} cost - Chi phí (chỉ khi status = Done)
 * @param {string} notes - Ghi chú (chỉ khi status = Done)
 */
const updateRepairRequestStatus = async (requestId, status, cost = null, notes = null) => {
  const allowedStatus = ["Pending", "Processing", "Done"];
  if (!allowedStatus.includes(status)) {
    throw new Error("Trạng thái không hợp lệ");
  }

  const request = await RepairRequest.findById(requestId);
  if (!request) {
    throw new Error("Yêu cầu sửa chữa không tồn tại");
  }

  request.status = status;

  // Nếu chuyển sang Done, cập nhật chi phí và ghi chú
  if (status === "Done") {
    if (cost !== null && cost !== undefined) {
      request.cost = cost;
    }
    if (notes !== null && notes !== undefined) {
      request.notes = notes;
    }
  }

  await request.save();

  return request;
};

/**
 * Lấy chi tiết yêu cầu sửa chữa theo ID
 * @param {string} requestId - ID của yêu cầu
 * @returns {Object} Request details
 */
const getRepairRequestById = async (requestId) => {
  try {
    const request = await RepairRequest.findById(requestId)
      .populate({
        path: "tenantId",
        select: "username email phoneNumber role",
        model: User,
      })
      .populate({
        path: "devicesId",
        select: "name brand model category unit price description",
        model: Device,
      })
      .lean();

    if (!request) {
      throw new Error("Yêu cầu sửa chữa không tồn tại");
    }

    // Populate thêm UserInfo
    if (request.tenantId) {
      const userInfo = await UserInfo.findOne({ userId: request.tenantId._id }).lean();
      if (userInfo) {
        request.tenantId.fullname = userInfo.fullname || null;
      }
    }

    // Format device info
    if (request.devicesId) {
      request.device = {
        _id: request.devicesId._id,
        name: request.devicesId.name,
        brand: request.devicesId.brand || "N/A",
        model: request.devicesId.model || "N/A",
        category: request.devicesId.category || "N/A",
        unit: request.devicesId.unit || "Cái",
        price: request.devicesId.price || 0,
        description: request.devicesId.description || "",
      };
    }

    return request;
  } catch (error) {
    console.error("Error getting repair request:", error);
    throw error;
  }
};

/**
 * Xóa yêu cầu sửa chữa
 * @param {string} requestId - ID của yêu cầu
 * @returns {Object} Deletion result
 */
const deleteRepairRequest = async (requestId) => {
  try {
    const request = await RepairRequest.findById(requestId);
    
    if (!request) {
      throw new Error("Yêu cầu sửa chữa không tồn tại");
    }

    // Xóa request (images URLs sẽ bị xóa theo)
    await RepairRequest.findByIdAndDelete(requestId);

    return {
      success: true,
      message: "Xóa yêu cầu sửa chữa thành công"
    };
  } catch (error) {
    console.error("Error deleting repair request:", error);
    throw error;
  }
};

module.exports = {
  createRepairRequest,
  getRepairRequests,
  getRepairRequestsByTenant,
  getRepairRequestById,
  updateRepairRequestStatus,
  deleteRepairRequest,
};
