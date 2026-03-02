const mongoose = require("mongoose");
const RepairRequest = require("../models/repair_requests.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
const Device = require("../../room-floor-management/models/devices.model");
const Contract = require("../../contract-management/models/contract.model");
const Invoice = require("../../invoice-management/models/invoice.model");
const FinancialTicket = require("../../managing-income-expenses/models/financial_tickets");

// Helper: chuẩn hoá chuỗi tiếng Việt để tìm kiếm không phân biệt dấu, hoa/thường
const normalizeVietnamese = (str = "") =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Helper: tính chi phí hiển thị cho một danh sách yêu cầu sửa chữa
// Dựa vào paymentType để query ngược lại từ Invoice hoặc FinancialTicket
const attachComputedCost = async (requests) => {
  // Tách requests thành 2 nhóm: REVENUE và EXPENSE
  const revenueRequests = requests.filter((r) => r.paymentType === "REVENUE");
  const expenseRequests = requests.filter((r) => r.paymentType === "EXPENSE");

  const invoiceMap = new Map();
  const ticketMap = new Map();

  // Query song song Invoice và FinancialTicket dựa vào repairRequestId/referenceId
  const queryPromises = [];
  
  // Query Invoice cho các request có paymentType = REVENUE
  if (revenueRequests.length > 0) {
    const revenueRequestIds = revenueRequests.map((r) => r._id.toString());
    queryPromises.push(
      Invoice.find({
        repairRequestId: { $in: revenueRequestIds },
      })
        .select("repairRequestId totalAmount")
        .lean()
        .then((invoices) => {
          invoices.forEach((inv) => {
            if (inv.repairRequestId) {
              invoiceMap.set(inv.repairRequestId.toString(), inv.totalAmount || 0);
            }
          });
        })
        .catch((err) => {
          console.error("Error fetching invoices:", err);
        })
    );
  }

  // Query FinancialTicket cho các request có paymentType = EXPENSE
  if (expenseRequests.length > 0) {
    const expenseRequestIds = expenseRequests.map((r) => r._id.toString());
    queryPromises.push(
      FinancialTicket.find({
        referenceId: { $in: expenseRequestIds },
      })
        .select("referenceId amount")
        .lean()
        .then((tickets) => {
          tickets.forEach((t) => {
            if (t.referenceId) {
              ticketMap.set(t.referenceId.toString(), t.amount || 0);
            }
          });
        })
        .catch((err) => {
          console.error("Error fetching financial tickets:", err);
        })
    );
  }

  // Chờ tất cả queries hoàn thành
  if (queryPromises.length > 0) {
    await Promise.all(queryPromises);
  }

  // Gắn cost vào từng request dựa vào paymentType
  for (const request of requests) {
    let cost = 0;
    const requestIdStr = request._id.toString();

    if (request.paymentType === "REVENUE") {
      // Lấy cost từ Invoice
      const invoiceAmount = invoiceMap.get(requestIdStr);
      if (invoiceAmount !== undefined && typeof invoiceAmount === "number") {
        cost = invoiceAmount;
      }
    } else if (request.paymentType === "EXPENSE") {
      // Lấy cost từ FinancialTicket
      const ticketAmount = ticketMap.get(requestIdStr);
      if (ticketAmount !== undefined && typeof ticketAmount === "number") {
        cost = ticketAmount;
      }
    }

    // Gắn thêm thuộc tính cost để FE hiển thị, KHÔNG lưu trong DB
    request.cost = cost;
  }

  return requests;
};

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
 * Tối ưu: Filter ở database level thay vì load tất cả rồi filter ở memory
 * @param {Object} filters - Các filter: roomSearch, tenantSearch, page (số trang, mặc định 1), limit (số item mỗi trang, mặc định 10)
 * @returns {Object} { data: Array, total: number, page: number, limit: number, totalPages: number }
 */
const getRepairRequests = async (filters = {}) => {
  try {
    // Tối ưu: Giới hạn số lượng query để tránh timeout
    // Load tối đa 500 records để xử lý filter và pagination (giảm để tránh timeout)
    const MAX_QUERY_LIMIT = 500;
    
    // Query RepairRequest với limit để tránh load quá nhiều dữ liệu
    const repairRequests = await RepairRequest.find({})
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
      .sort({ createdDate: -1 })
      .limit(MAX_QUERY_LIMIT)
      .lean();

    // Nếu không có kết quả, return empty pagination result ngay
    if (repairRequests.length === 0) {
      return {
        data: [],
        total: 0,
        page: parseInt(filters.page) || 1,
        limit: parseInt(filters.limit) || 10,
        totalPages: 0,
      };
    }

    // Tối ưu: Batch queries cho UserInfo và Contract - chỉ query những tenant có trong repairRequests
    const tenantIds = [...new Set(
      repairRequests
        .map((r) => r.tenantId?._id)
        .filter(Boolean)
        .map((id) => id.toString())
    )];

    const userInfoMap = new Map();
    const contractMap = new Map();

    if (tenantIds.length > 0) {
      // Tối ưu: Query song song UserInfo và Contract để giảm thời gian chờ
      try {
        const [userInfos, contracts] = await Promise.all([
          // Batch query UserInfo - chỉ query những userId có trong tenantIds
          UserInfo.find({
            userId: { $in: tenantIds },
          }).lean(),
          // Batch query Contracts - chỉ query những tenantId có trong tenantIds
          Contract.find({
            tenantId: { $in: tenantIds },
            status: "active",
          })
            .populate({
              path: "roomId",
              select: "name roomCode",
            })
            .lean(),
        ]);

        // Build userInfoMap
        userInfos.forEach((info) => {
          if (info.userId) {
            userInfoMap.set(info.userId.toString(), info.fullname || null);
          }
        });

        // Build contractMap
        contracts.forEach((contract) => {
          if (contract.tenantId) {
            contractMap.set(contract.tenantId.toString(), contract);
          }
        });
      } catch (err) {
        console.error("Error fetching userInfos or contracts:", err);
      }
    }

    // Gắn thông tin vào từng request
    for (let request of repairRequests) {
      if (request.tenantId) {
        const tenantIdStr = request.tenantId._id.toString();
        
        // Lấy fullname từ map
        const fullname = userInfoMap.get(tenantIdStr);
        if (fullname !== undefined) {
          request.tenantId.fullname = fullname;
        }

        // Lấy room từ contract map
        const activeContract = contractMap.get(tenantIdStr);
        if (activeContract?.roomId) {
          request.room = {
            _id: activeContract.roomId._id,
            name: activeContract.roomId.name,
            roomCode: activeContract.roomId.roomCode,
          };
        } else {
          request.room = null;
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
    }

    // Gắn chi phí hiển thị
    await attachComputedCost(repairRequests);

    // Nếu có filter nhưng chưa filter ở trên (trường hợp không có tenantSearch/roomSearch),
    // hoặc cần filter lại để đảm bảo chính xác (do normalizeVietnamese không thể dùng trong MongoDB query)
    let filteredRequests = repairRequests;
    
    if (filters.roomSearch && filters.roomSearch.trim()) {
      const searchTerm = normalizeVietnamese(filters.roomSearch.trim());
      filteredRequests = filteredRequests.filter((request) => {
        if (request.room) {
          const roomName = normalizeVietnamese(request.room.name || "");
          const roomCode = normalizeVietnamese(request.room.roomCode || "");
          return roomName.includes(searchTerm) || roomCode.includes(searchTerm);
        }
        return false;
      });
    }

    if (filters.tenantSearch && filters.tenantSearch.trim()) {
      const searchTerm = normalizeVietnamese(filters.tenantSearch.trim());
      filteredRequests = filteredRequests.filter((request) => {
        if (request.tenantId) {
          const fullname = normalizeVietnamese(request.tenantId.fullname || "");
          const username = normalizeVietnamese(request.tenantId.username || "");
          const email = normalizeVietnamese(request.tenantId.email || "");
          return (
            fullname.includes(searchTerm) ||
            username.includes(searchTerm) ||
            email.includes(searchTerm)
          );
        }
        return false;
      });
    }

    // Pagination
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 10;
    const total = filteredRequests.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    // Áp dụng pagination
    const paginatedRequests = filteredRequests.slice(skip, skip + limit);

    return {
      data: paginatedRequests,
      total,
      page,
      limit,
      totalPages,
    };
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

    await attachComputedCost(repairRequests);

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
 * @param {number} cost - Chi phí (KHÔNG sử dụng nữa, giữ tham số cho tương thích)
 * @param {string} notes - Ghi chú (chỉ khi status = Done)
 * @param {Object|null} invoiceData - Thông tin tạo hóa đơn (sửa chữa có phí)
 * @param {Object|null} financialTicketData - Thông tin tạo phiếu chi (sửa chữa miễn phí)
 * @param {string|null} paymentType - Loại thanh toán: "REVENUE" (có phí) hoặc "EXPENSE" (miễn phí)
 */
const updateRepairRequestStatus = async (
  requestId,
  status,
  cost = null,
  notes = null,
  invoiceData = null,
  financialTicketData = null,
  paymentType = null
) => {
  const allowedStatus = ["Pending", "Processing", "Done"];
  if (!allowedStatus.includes(status)) {
    throw new Error("Trạng thái không hợp lệ");
  }

  const request = await RepairRequest.findById(requestId);
  if (!request) {
    throw new Error("Yêu cầu sửa chữa không tồn tại");
  }

  request.status = status;

  // Nếu chuyển sang Done, cập nhật chi phí, ghi chú và tạo các chứng từ liên quan
  if (status === "Done") {
    if (notes !== null && notes !== undefined) {
      request.notes = notes;
    }

    // Cập nhật paymentType + paymentStatus
    // - REVENUE  : sửa chữa có phí → tạo hóa đơn, mặc định chờ thanh toán (UNPAID)
    // - EXPENSE  : sửa chữa miễn phí cho cư dân → không tham gia luồng thanh toán, không đụng paymentStatus
    if (paymentType !== null && paymentType !== undefined) {
      request.paymentType = paymentType;

      if (paymentType === "REVENUE") {
        request.paymentStatus = "UNPAID";
      }
    }

    // 1. Tạo hóa đơn nếu frontend gửi kèm dữ liệu invoice (sửa chữa có phí cho cư dân)
    if (invoiceData) {
      const { invoiceCode, title, totalAmount, dueDate } = invoiceData;

      // Tìm hợp đồng đang active để lấy roomId
      const activeContract = await Contract.findOne({
        tenantId: request.tenantId,
        status: "active",
      })
        .populate({
          path: "roomId",
          select: "_id",
        })
        .lean();

      if (!activeContract || !activeContract.roomId) {
        throw new Error("Không tìm thấy phòng đang thuê của cư dân để tạo hóa đơn");
      }

      const roomId = activeContract.roomId._id || activeContract.roomId;

      // Chuẩn bị chi tiết hóa đơn (items) - 1 dòng cho lần sửa chữa này
      const items = [
        {
          itemName: title || "Chi phí sửa chữa",
          oldIndex: 0,
          newIndex: 0,
          usage: 1,
          unitPrice: totalAmount,
          amount: totalAmount,
        },
      ];

      const newInvoice = new Invoice({
        invoiceCode,
        roomId,
        repairRequestId: request._id, // liên kết hóa đơn với yêu cầu sửa chữa
        title,
        type: "Incurred",
        items,
        totalAmount,
        status: "Unpaid",
        dueDate,
      });

      await newInvoice.save();
      // Không cần lưu invoiceId vào RepairRequest nữa, đã có repairRequestId trong Invoice
    }

    // 2. Tạo phiếu chi nội bộ nếu frontend gửi kèm dữ liệu financialTicket (sửa chữa miễn phí)
    if (financialTicketData) {
      const { type = "Payment", amount, title } = financialTicketData;

      if (amount === undefined || amount === null) {
        throw new Error("Thiếu số tiền cho phiếu chi");
      }

      const newTicket = new FinancialTicket({
        type: type || "Payment",
        amount,
        title,
        referenceId: request._id,
        status: "Created",
        transactionDate: new Date(),
      });

      await newTicket.save();
      // Không cần lưu financialTicketId vào RepairRequest nữa, đã có referenceId trong FinancialTicket
    }
  }

  await request.save();

  // Chuyển sang object thường để gắn thêm cost hiển thị
  const plainRequest = request.toObject();
  await attachComputedCost([plainRequest]);

  return plainRequest;
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

    // Gắn chi phí hiển thị
    await attachComputedCost([request]);

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
