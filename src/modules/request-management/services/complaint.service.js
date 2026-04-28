/**
 * Complaint Request Service
 * Xử lý business logic cho khiếu nại
 */

const ComplaintRequest = require("../models/complaint_requests.model");
const Contract = require("../../contract-management/models/contract.model");
const UserInfo = require("../../authentication/models/userInfor.model");

/**
 * Tạo yêu cầu khiếu nại mới
 * @param {Object} data - {tenantId, content, category}
 * @returns {Object} Complaint request vừa tạo
 */
const createComplaintRequest = async (data) => {
  try {
    const { tenantId, content, category } = data;

    // Validate input
    if (!tenantId || !content || !category) {
      throw new Error("Missing required fields: tenantId, content, category");
    }

    const complaint = new ComplaintRequest({
      tenantId,
      content,
      category,
      status: "Pending"
    });

    const savedComplaint = await complaint.save();
    
    const populated = await savedComplaint.populate([
      { path: "tenantId", select: "username email phoneNumber" },
      { path: "responseBy", select: "username email role" }
    ]);

    // Lấy fullname từ UserInfo
    const userInfo = await UserInfo.findOne({ userId: tenantId }).select("fullname").lean();
    if (userInfo && populated.tenantId) {
      populated.tenantId.fullname = userInfo.fullname;
    }
    
    return populated;
  } catch (error) {
    throw new Error(`Error creating complaint: ${error.message}`);
  }
};

/**
 * Lấy khiếu nại theo ID
 * @param {string} id - Complaint ID
 * @returns {Object} Complaint details
 */
const getComplaintById = async (id) => {
  try {
    const complaint = await ComplaintRequest.findById(id)
      .populate("tenantId", "username email phoneNumber")
      .populate("responseBy", "username email role")
      .lean();

    if (complaint && complaint.tenantId) {
      const userInfo = await UserInfo.findOne({ userId: complaint.tenantId._id }).select("fullname").lean();
      complaint.tenantId.fullname = userInfo?.fullname || null;
    }

    return complaint;
  } catch (error) {
    throw new Error(`Error fetching complaint: ${error.message}`);
  }
};

/**
 * Lấy danh sách khiếu nại với filter và phân trang
 * @param {Object} filters - {tenantId, status, category}
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Object} {data, total, page, limit}
 */
const getComplaintsList = async (filters = {}, page = 1, limit = 10) => {
  try {
    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    if (filters.tenantId) query.tenantId = filters.tenantId;
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;

    // Get total count
    const total = await ComplaintRequest.countDocuments(query);

    // Get paginated results
    const complaints = await ComplaintRequest.find(query)
      .populate("tenantId", "username email phoneNumber")
      .populate("responseBy", "username email role")
      .sort({ createdDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Gắn thông tin phòng (room) dựa theo hợp đồng đang active của tenant
    const tenantIds = [
      ...new Set(
        complaints
          .map((c) => c.tenantId?._id)
          .filter(Boolean)
          .map((id) => id.toString())
      ),
    ];

    const roomByTenant = new Map();
    const fullnameByTenant = new Map();

    if (tenantIds.length > 0) {
      // Lấy thông tin phòng
      const [contracts, userInfos] = await Promise.all([
        Contract.find({
          tenantId: { $in: tenantIds },
          status: "active",
        })
          .populate({
            path: "roomId",
            select: "name roomCode",
          })
          .lean(),
        UserInfo.find({
          userId: { $in: tenantIds }
        })
          .select("userId fullname")
          .lean()
      ]);

      contracts.forEach((ct) => {
        if (ct.tenantId && ct.roomId) {
          roomByTenant.set(ct.tenantId.toString(), {
            _id: ct.roomId._id,
            name: ct.roomId.name,
            roomCode: ct.roomId.roomCode,
          });
        }
      });

      userInfos.forEach((ui) => {
        if (ui.userId) {
          fullnameByTenant.set(ui.userId.toString(), ui.fullname);
        }
      });
    }

    complaints.forEach((c) => {
      if (c.tenantId?._id) {
        const tenantIdStr = c.tenantId._id.toString();
        
        const room = roomByTenant.get(tenantIdStr);
        c.room = room || null;

        const fullname = fullnameByTenant.get(tenantIdStr);
        c.tenantId.fullname = fullname || null;
      } else {
        c.room = null;
      }
    });

    return {
      data: complaints,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    throw new Error(`Error fetching complaint list: ${error.message}`);
  }
};

/**
 * Cập nhật thông tin khiếu nại (chỉ content, category)
 * @param {string} id - Complaint ID
 * @param {Object} data - {content, category}
 * @returns {Object} Updated complaint
 */
const updateComplaintRequest = async (id, data) => {
  try {
    const { content, category } = data;

    const updateData = {};
    if (content) updateData.content = content;
    if (category) updateData.category = category;

    const complaint = await ComplaintRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    )
      .populate("tenantId", "username email phoneNumber")
      .populate("responseBy", "username email role")
      .lean();

    if (complaint && complaint.tenantId) {
      const userInfo = await UserInfo.findOne({ userId: complaint.tenantId._id }).select("fullname").lean();
      complaint.tenantId.fullname = userInfo?.fullname || null;
    }

    return complaint;
  } catch (error) {
    throw new Error(`Error updating complaint: ${error.message}`);
  }
};

/**
 * Cập nhật trạng thái khiếu nại (chỉ manager/admin)
 * @param {string} id - Complaint ID
 * @param {string} status - "Pending", "Processing", "Done", "Rejected"
 * @param {string} response - Response message
 * @param {string} responderId - User ID who responds
 * @param {string} managerNote - Manager note when rejecting/handling
 * @returns {Object} Updated complaint
 */
const updateComplaintStatus = async (id, status, response, responderId, managerNote) => {
  try {
    const current = await ComplaintRequest.findById(id).select("status").lean();
    if (!current) {
      throw new Error("Khiếu nại không tồn tại");
    }

    // Chỉ không cho chuyển lại cùng trạng thái (Pending → Pending, Done → Done...)
    if (current.status === status) {
      throw new Error("Khiếu nại đã ở trạng thái này");
    }

    const updateData = {
      status,
      ...(response && { response }),
      ...((response || managerNote) && { responseBy: responderId }),
      ...((response || managerNote) && { responseDate: new Date() }),
      ...(managerNote && { managerNote })
    };

    const complaint = await ComplaintRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    )
      .populate("tenantId", "username email phoneNumber")
      .populate("responseBy", "username email role")
      .lean();

    if (complaint && complaint.tenantId) {
      const userInfo = await UserInfo.findOne({ userId: complaint.tenantId._id }).select("fullname").lean();
      complaint.tenantId.fullname = userInfo?.fullname || null;
    }

    return complaint;
  } catch (error) {
    throw new Error(`Error updating complaint status: ${error.message}`);
  }
};

/**
 * Xóa khiếu nại
 * @param {string} id - Complaint ID
 */
const deleteComplaint = async (id) => {
  try {
    await ComplaintRequest.findByIdAndDelete(id);
    return { success: true };
  } catch (error) {
    throw new Error(`Error deleting complaint: ${error.message}`);
  }
};

/**
 * Lấy thống kê khiếu nại
 * @returns {Object} Statistics
 */
const getComplaintStatistics = async () => {
  try {
    const [
      totalComplaints,
      pendingCount,
      processingCount,
      doneCount,
      byCategory
    ] = await Promise.all([
      ComplaintRequest.countDocuments(),
      ComplaintRequest.countDocuments({ status: "Pending" }),
      ComplaintRequest.countDocuments({ status: "Processing" }),
      ComplaintRequest.countDocuments({ status: "Done" }),
      ComplaintRequest.aggregate([
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])
    ]);

    return {
      total: totalComplaints,
      byStatus: {
        pending: pendingCount,
        processing: processingCount,
        done: doneCount
      },
      byCategory,
      completionRate: totalComplaints > 0 
        ? ((doneCount / totalComplaints) * 100).toFixed(2) 
        : 0
    };
  } catch (error) {
    throw new Error(`Error fetching statistics: ${error.message}`);
  }
};

/**
 * Lấy khiếu nại theo category
 * @param {string} category - Category name
 * @returns {Array} Complaints
 */
const getComplaintsByCategory = async (category) => {
  try {
    const complaints = await ComplaintRequest.find({ category })
      .populate("tenantId", "username email phoneNumber")
      .populate("responseBy", "username email role")
      .sort({ createdDate: -1 })
      .lean();

    if (complaints.length > 0) {
      const tenantIds = [...new Set(complaints.map(c => c.tenantId?._id).filter(Boolean))];
      const userInfos = await UserInfo.find({ userId: { $in: tenantIds } }).select("userId fullname").lean();
      const fullnameMap = new Map(userInfos.map(ui => [ui.userId.toString(), ui.fullname]));
      
      complaints.forEach(c => {
        if (c.tenantId?._id) {
          c.tenantId.fullname = fullnameMap.get(c.tenantId._id.toString()) || null;
        }
      });
    }

    return complaints;
  } catch (error) {
    throw new Error(`Error fetching complaints by category: ${error.message}`);
  }
};

module.exports = {
  createComplaintRequest,
  getComplaintById,
  getComplaintsList,
  updateComplaintRequest,
  updateComplaintStatus,
  deleteComplaint,
  getComplaintStatistics,
  getComplaintsByCategory
};
