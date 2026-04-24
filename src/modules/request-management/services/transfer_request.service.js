const TransferRequest = require("../models/transfer_request.model");
const Contract = require("../../contract-management/models/contract.model");
const Room = require("../../room-floor-management/models/room.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
const BookService = require("../../contract-management/models/bookservice.model");
const InvoicePeriodic = require("../../invoice-management/models/invoice_periodic.model");
const MeterReading = require("../../invoice-management/models/meterreading.model");
const Service = require("../../service-management/models/service.model");
const FinancialTicket = require("../../managing-income-expenses/models/financial_tickets");
const mongoose = require("mongoose");

/**
 * Helper: Tạo mã yêu cầu chuyển phòng
 * Format: TR-YYYYMMDD-Random4
 */
const generateRequestCode = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TR-${y}${m}${d}-${rand}`;
};

/**
 * Helper: Đọc giá tiền từ Decimal128 hoặc Number
 */
const extractPrice = (priceField) => {
  if (!priceField) return 0;
  if (typeof priceField === "object" && priceField.$numberDecimal) {
    return parseFloat(priceField.$numberDecimal);
  }
  return Number(priceField) || 0;
};

/**
 * Helper: Tính số tháng khả dụng từ rentPaidUntil
 * Rule: Bỏ tháng hiện tại nếu không tròn, chỉ đếm từ tháng tiếp theo đến tháng của rentPaidUntil (inclusive)
 * Ví dụ: today = 23/04/2026, rentPaidUntil = 30/06/2026 → tháng 5 + 6 = 2 tháng
 * @param {Date} rentPaidUntil - Ngày trả trước trong hợp đồng
 * @returns {number} Số tháng khả dụng (>= 0)
 */
const calculateAvailableMonths = (rentPaidUntil) => {
  if (!rentPaidUntil) return 0;
  const paidUntil = new Date(rentPaidUntil);
  const now = new Date();

  // Đầu tháng tiếp theo
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  nextMonthStart.setHours(0, 0, 0, 0);

  // paidUntil phải vươn sang tháng tiếp theo mới có tháng khả dụng
  if (paidUntil < nextMonthStart) return 0;

  // Đếm số tháng từ nextMonthStart đến tháng của paidUntil (inclusive)
  const startYear = nextMonthStart.getFullYear();
  const startMonth = nextMonthStart.getMonth(); // 0-indexed
  const endYear = paidUntil.getFullYear();
  const endMonth = paidUntil.getMonth(); // 0-indexed

  const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  return Math.max(0, months);
};

/**
 * Helper: Tạo mã phiếu chi hoàn tiền chuyển phòng
 * Format: PAY-DDMMYYYY-XXXX
 */
const getTransferRefundVoucher = async () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const prefix = `PAY-${dd}${mm}${yyyy}-`;

  const latest = await FinancialTicket.findOne({
    paymentVoucher: { $regex: `^${prefix}\\d{4}$` },
  })
    .select("paymentVoucher")
    .sort({ paymentVoucher: -1 })
    .lean();

  let nextNumber = 1;
  if (latest?.paymentVoucher) {
    const suffix = latest.paymentVoucher.slice(prefix.length);
    const parsed = parseInt(suffix, 10);
    if (!Number.isNaN(parsed)) nextNumber = parsed + 1;
  }

  for (let i = 0; i < 100; i++) {
    if (nextNumber > 9999) throw new Error("Đã vượt quá giới hạn mã phiếu chi trong ngày (9999)");
    const candidate = `${prefix}${String(nextNumber).padStart(4, "0")}`;
    const exists = await FinancialTicket.exists({ paymentVoucher: candidate });
    if (!exists) return candidate;
    nextNumber++;
  }
  throw new Error("Không thể tạo mã phiếu chi mới, vui lòng thử lại");
};

/**
 * Helper: Kiểm tra phòng có trống trong khoảng thời gian hay không
 * Logic:
 *   - Phòng NOT available nếu có hợp đồng active đang chiếm (overlap)
 *   - Phòng NOT available nếu có hợp đồng tương lai (inactive/pending) bắt đầu
 *     TRƯỚC hoặc ĐÚNG ngày kết thúc hợp đồng tenant hiện tại (periodEnd)
 *   - Phòng AVAILABLE nếu hợp đồng tương lai bắt đầu SAU periodEnd
 *     (tenant rời trước khi người mới vào)
 * @param {string} targetRoomId - ID phòng muốn chuyển đến
 * @param {Date} startDate - Ngày bắt đầu cần kiểm tra (transferDate)
 * @param {Date} endDate - Ngày kết thúc cần kiểm tra (endDate hợp đồng)
 * @returns {Object} { isAvailable, conflictingContract, conflictingRequest }
 */
const checkRoomAvailabilityInPeriod = async (targetRoomId, startDate, endDate) => {
  const roomIdObj = new mongoose.Types.ObjectId(targetRoomId);

  const periodEnd = new Date(endDate);
  periodEnd.setHours(23, 59, 59, 999);

  // 1. Kiểm tra hợp đồng active đang chiếm phòng (overlap check)
  const conflictingActiveContract = await Contract.findOne({
    roomId: roomIdObj,
    status: "active",
    startDate: { $lt: periodEnd },
    endDate: { $gt: startDate },
  }).lean();

  if (conflictingActiveContract) {
    return {
      isAvailable: false,
      conflictingContract: conflictingActiveContract,
      conflictingRequest: null,
    };
  }

  // 2. Kiểm tra hợp đồng tương lai (inactive/pending) chưa bắt đầu
  // Tìm hợp đồng gần nhất với startDate trong tương lai
  // → Conflict nếu futureContract.startDate <= periodEnd (người mới vào trước khi tenant hiện tại rời)
  // → Available nếu futureContract.startDate > periodEnd (tenant rời trước khi người mới đến)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nearestFutureContract = await Contract.findOne({
    roomId: roomIdObj,
    status: { $in: ["inactive", "pending"] },
    startDate: { $gt: today, $lte: periodEnd }, // Bắt đầu tương lai nhưng <= ngày hết hợp đồng tenant
  })
    .sort({ startDate: 1 })
    .lean();

  if (nearestFutureContract) {
    return {
      isAvailable: false,
      conflictingContract: nearestFutureContract,
      conflictingRequest: null,
    };
  }

  // 3. Kiểm tra yêu cầu chuyển phòng đã Approved (chưa Completed)
  // Approved = phòng đã được đặt chỗ cho người khác chuyển vào
  const conflictingRequest = await TransferRequest.findOne({
    targetRoomId: roomIdObj,
    status: "Approved",
    $or: [
      { transferDate: { $gte: startDate, $lte: periodEnd } },
      { transferDate: { $lt: startDate } },
    ],
  })
    .populate({
      path: "currentRoomId",
      select: "name roomCode",
      populate: { path: "floorId", select: "name" },
    })
    .populate({
      path: "targetRoomId",
      select: "name roomCode",
      populate: { path: "floorId", select: "name" },
    })
    .populate("tenantId", "username email")
    .lean();

  if (conflictingRequest) {
    return {
      isAvailable: false,
      conflictingContract: null,
      conflictingRequest,
    };
  }

  return { isAvailable: true, conflictingContract: null, conflictingRequest: null };
};

/**
 * [TENANT] Lấy danh sách phòng trống để chọn chuyển đến
 * Logic:
 *   - Phòng status="Available" không có hợp đồng tương lai → trống hoàn toàn
 *   - Phòng status="Available" có hợp đồng tương lai (inactive/pending) nhưng startDate > contractEndDate
 *     → tenant hiện tại rời trước khi người mới đến → vẫn available
 */
const getAvailableRoomsForTransfer = async (tenantId) => {
  // Kiểm tra tenant có hợp đồng active không
  const activeContracts = await Contract.find({ tenantId, status: { $in: ["active", "inactive"] } }).sort({ createdAt: -1 });
  if (activeContracts.length === 0) {
    throw {
      status: 400,
      message:
        "Bạn không có hợp đồng hiệu lực. Không thể yêu cầu chuyển phòng.",
    };
  }
  const contract = activeContracts[0];

  // Lấy danh sách phòng Available (loại trừ phòng hiện tại)
  const rooms = await Room.find({
    status: "Available",
    isActive: true,
    _id: { $ne: contract.roomId },
  })
    .populate("floorId", "name")
    .populate(
      "roomTypeId",
      "typeName currentPrice personMax description images",
    )
    .lean();

  // Fix Decimal128
  const data = rooms.map((room) => {
    if (room.roomTypeId?.currentPrice) {
      room.roomTypeId.currentPrice = parseFloat(
        room.roomTypeId.currentPrice.toString(),
      );
    }
    return room;
  });

  // Ngày kết thúc hợp đồng tenant hiện tại (23:59:59 để so sánh inclusive)
  const contractEndDate = new Date(contract.endDate);
  contractEndDate.setHours(23, 59, 59, 999);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const roomIds = data.map((r) => r._id);

  // Batch query: tìm các phòng BỊ CHẶN bởi hợp đồng tương lai
  // Phòng bị chặn khi: có hợp đồng inactive/pending với startDate > today
  // VÀ startDate <= contractEndDate (người mới đến trước khi tenant hiện tại rời)
  const blockingContracts = await Contract.find({
    roomId: { $in: roomIds },
    status: { $in: ["inactive", "pending"] },
    startDate: { $gt: today, $lte: contractEndDate },
  }).lean();

  const blockedRoomIds = new Set(
    blockingContracts.map((c) => c.roomId.toString())
  );

  // Phòng không bị chặn bởi hợp đồng tương lai → available
  const availableRooms = data.filter(
    (room) => !blockedRoomIds.has(room._id.toString())
  );

  return { currentContract: contract, availableRooms };
};

/**
 * [TENANT] Tạo yêu cầu chuyển phòng
 */
const createTransferRequest = async (tenantId, body) => {
  const { roomId, targetRoomId, transferDate, reason } = body;

  // 1. Kiểm tra tenant có hợp đồng active
  const activeContracts = await Contract.find({ tenantId, status: { $in: ["active", "inactive"] } });
  if (activeContracts.length === 0) {
    throw {
      status: 400,
      message: "Bạn không có hợp đồng hiệu lực. Không thể yêu cầu chuyển phòng.",
    };
  }

  // Xác định hợp đồng theo roomId nếu được truyền
  let contract = activeContracts[0];
  if (roomId) {
    contract = activeContracts.find(c => c.roomId.toString() === roomId.toString());
    if (!contract) {
      throw {
        status: 400,
        message: "Phòng hiện tại (roomId) không thuộc hợp đồng có hiệu lực của bạn (hoặc hợp đồng đã kết thúc).",
      };
    }
  }

  // 2. Kiểm tra tenant không có yêu cầu chuyển phòng đang Pending
  const existingPending = await TransferRequest.findOne({
    tenantId,
    status: "Pending",
  });
  if (existingPending) {
    throw {
      status: 400,
      message:
        "Bạn đã có một yêu cầu chuyển phòng đang chờ duyệt. Vui lòng đợi kết quả trước khi tạo yêu cầu mới.",
    };
  }

  // Kiểm tra không có yêu cầu đã Approved chưa Completed
  const existingApproved = await TransferRequest.findOne({
    tenantId,
    status: "Approved",
  });
  if (existingApproved) {
    throw {
      status: 400,
      message:
        "Bạn đã có yêu cầu chuyển phòng được duyệt đang chờ bàn giao. Vui lòng hoàn tất trước khi tạo yêu cầu mới.",
    };
  }

  // 3. Xác định phòng hiện tại (từ roomId nếu có, hoặc từ contract)
  let currentRoom = contract.roomId;
  if (roomId) {
    currentRoom = await Room.findById(roomId);
    if (!currentRoom) {
      throw { status: 404, message: "Phòng hiện tại (roomId) không tồn tại." };
    }
    if (!currentRoom.isActive) {
      throw { status: 400, message: "Phòng hiện tại đang bị tạm ngưng." };
    }
  }

  // 4. Kiểm tra phòng mới
  const targetRoom = await Room.findById(targetRoomId).populate(
    "roomTypeId",
    "currentPrice typeName personMax",
  );
  if (!targetRoom) {
    throw { status: 404, message: "Phòng muốn chuyển đến không tồn tại." };
  }
  if (targetRoom.status !== "Available") {
    throw {
      status: 400,
      message: "Phòng muốn chuyển đến không ở trạng thái Trống (Available).",
    };
  }
  if (!targetRoom.isActive) {
    throw { status: 400, message: "Phòng muốn chuyển đến đang bị tạm ngưng." };
  }

  // 4.5. Kiểm tra phòng mới có trống trong khoảng thời gian còn lại của hợp đồng
  // (sử dụng transferDate từ body, chưa parse ở bước 7)
  const checkTransferDate = new Date(body.transferDate);
  const contractEndDate = new Date(contract.endDate);
  const availability = await checkRoomAvailabilityInPeriod(
    targetRoomId,
    checkTransferDate,
    contractEndDate,
  );
  if (!availability.isAvailable) {
    let conflictInfo = "";
    if (availability.conflictingContract) {
      const c = availability.conflictingContract;
      const startStr = c.startDate ? new Date(c.startDate).toLocaleDateString("vi-VN") : "N/A";
      const endStr = c.endDate ? new Date(c.endDate).toLocaleDateString("vi-VN") : "N/A";
      conflictInfo = `Phòng đã có hợp đồng (${c.contractCode || "không mã"}) từ ${startStr} đến ${endStr}.`;
    } else if (availability.conflictingRequest) {
      const r = availability.conflictingRequest;
      const transferStr = r.transferDate ? new Date(r.transferDate).toLocaleDateString("vi-VN") : "N/A";
      conflictInfo = `Phòng đã có yêu cầu chuyển phòng được duyệt vào ngày ${transferStr} (${r.tenantId?.username || "không xác định"}).`;
    }
    throw {
      status: 400,
      message: `Phòng muốn chuyển đến không trống trong toàn bộ thời gian còn lại của hợp đồng (đến ${contractEndDate.toLocaleDateString("vi-VN")}). ${conflictInfo} Vui lòng chọn phòng khác hoặc chọn ngày chuyển phù hợp.`,
    };
  }

  // 5. Không cho chuyển vào chính phòng hiện tại
  if (currentRoom._id.toString() === targetRoomId) {
    throw {
      status: 400,
      message: "Không thể chuyển vào chính phòng bạn đang ở.",
    };
  }

  // 6. Kiểm tra số người ở hiện tại <= personMax phòng mới
  const personMax = targetRoom.roomTypeId?.personMax || 1;
  const totalPeople =
    (contract.coResidents ? contract.coResidents.length : 0) + 1;
  if (totalPeople > personMax) {
    throw {
      status: 400,
      message: `Số người hiện tại (${totalPeople}) vượt quá giới hạn phòng mới (tối đa ${personMax} người).`,
    };
  }

  // 7. Kiểm tra ngày chuyển phòng hợp lệ (Bắt buộc là ngày mai)
  const transferDateObj = new Date(transferDate);
  transferDateObj.setHours(0, 0, 0, 0);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  if (transferDateObj.getTime() !== tomorrow.getTime()) {
    throw {
      status: 400,
      message: "Ngày chuyển phòng bắt buộc phải là ngày mai.",
    };
  }

  // 8. Tạo yêu cầu
  const transferRequest = new TransferRequest({
    requestCode: generateRequestCode(),
    tenantId,
    contractId: contract._id,
    currentRoomId: currentRoom._id,
    targetRoomId: targetRoom._id,
    transferDate: transferDateObj,
    reason,
    status: "Pending",
  });

  await transferRequest.save();

  // Populate để trả về thông tin đầy đủ
  const populated = await TransferRequest.findById(transferRequest._id)
    .populate({
      path: "currentRoomId",
      select: "name roomCode",
      populate: { path: "floorId", select: "name" },
    })
    .populate({
      path: "targetRoomId",
      select: "name roomCode",
      populate: [
        { path: "floorId", select: "name" },
        { path: "roomTypeId", select: "typeName currentPrice" },
      ],
    })
    .lean();

  // Fix Decimal128
  if (populated.targetRoomId?.roomTypeId?.currentPrice) {
    populated.targetRoomId.roomTypeId.currentPrice = parseFloat(
      populated.targetRoomId.roomTypeId.currentPrice.toString(),
    );
  }

  return populated;
};

/**
 * Helper: Đồng bộ TransferRequest với trạng thái hóa đơn
 * Chỉ chuyển sang Paid khi: hóa đơn dịch vụ đã Paid VÀ hóa đơn đóng thêm (nếu có) đã Paid
 */
const _syncPendingTransferRequestsWithPaidInvoices = async () => {
  const pendingRequests = await TransferRequest.find({
    status: "InvoiceReleased",
    transferInvoiceId: { $ne: null }
  })
    .populate('transferInvoiceId', 'status')
    .populate('prepaidInvoiceId', 'status');

  for (const req of pendingRequests) {
    const serviceInvoicePaid = req.transferInvoiceId?.status === "Paid";
    // Nếu có hóa đơn đóng thêm thì phải Paid cả hai, nếu không có thì chỉ cần hóa đơn dịch vụ
    const prepaidInvoicePaid = req.prepaidInvoiceId
      ? req.prepaidInvoiceId.status === "Paid"
      : true;

    if (serviceInvoicePaid && prepaidInvoicePaid) {
      req.status = "Paid";
      await req.save();
      console.log(`[TRANSFER_SYNC] ✅ TransferRequest ${req._id} → Paid (dịch vụ + ${req.prepaidInvoiceId ? 'đóng thêm' : 'không có đóng thêm'}).`);
    }
  }
};


/**
 * [TENANT] Xem danh sách yêu cầu chuyển phòng của mình
 */
const getMyTransferRequests = async (tenantId) => {
  await _syncPendingTransferRequestsWithPaidInvoices();
  const requests = await TransferRequest.find({ tenantId })
    .populate({
      path: "currentRoomId",
      select: "name roomCode",
      populate: { path: "floorId", select: "name" },
    })
    .populate({
      path: "targetRoomId",
      select: "name roomCode",
      populate: [
        { path: "floorId", select: "name" },
        { path: "roomTypeId", select: "typeName currentPrice" },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();

  // Fix Decimal128
  return requests.map((r) => {
    if (r.targetRoomId?.roomTypeId?.currentPrice) {
      r.targetRoomId.roomTypeId.currentPrice = parseFloat(
        r.targetRoomId.roomTypeId.currentPrice.toString(),
      );
    }
    return r;
  });
};

/**
 * [MANAGER] Lấy danh sách tất cả yêu cầu chuyển phòng (có lọc và phân trang)
 * @param {Object} filters - { status, search, page, limit }
 */
const getAllTransferRequestsForManager = async (filters = {}) => {
  await _syncPendingTransferRequestsWithPaidInvoices();
  const { status, search, page = 1, limit = 10 } = filters;

  const query = {};
  if (status) query.status = status;

  let requests = await TransferRequest.find(query)
    .populate({ path: "tenantId", select: "username email phoneNumber" })
    .populate({
      path: "currentRoomId",
      select: "name roomCode",
      populate: [
        { path: "floorId", select: "name" },
        { path: "roomTypeId", select: "typeName currentPrice" },
      ],
    })
    .populate({
      path: "targetRoomId",
      select: "name roomCode",
      populate: [
        { path: "floorId", select: "name" },
        { path: "roomTypeId", select: "typeName currentPrice" },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();

  // Fix Decimal128
  requests = requests.map((r) => {
    if (r.currentRoomId?.roomTypeId?.currentPrice) {
      r.currentRoomId.roomTypeId.currentPrice = parseFloat(
        r.currentRoomId.roomTypeId.currentPrice.toString()
      );
    }
    if (r.targetRoomId?.roomTypeId?.currentPrice) {
      r.targetRoomId.roomTypeId.currentPrice = parseFloat(
        r.targetRoomId.roomTypeId.currentPrice.toString()
      );
    }
    return r;
  });

  // Batch query UserInfo → gắn fullname vào tenantId
  const tenantIds = [...new Set(requests.map((r) => r.tenantId?._id).filter(Boolean).map(String))];
  if (tenantIds.length > 0) {
    const userInfos = await UserInfo.find({ userId: { $in: tenantIds } }).lean();
    const infoMap = new Map(userInfos.map((u) => [u.userId.toString(), u.fullname || null]));
    requests = requests.map((r) => {
      if (r.tenantId?._id) {
        r.tenantId.fullname = infoMap.get(r.tenantId._id.toString()) || null;
      }
      return r;
    });
  }

  // Tìm kiếm theo fullname / username / email / phone
  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    requests = requests.filter((r) => {
      const fullname = (r.tenantId?.fullname || "").toLowerCase();
      const username = (r.tenantId?.username || "").toLowerCase();
      const email = (r.tenantId?.email || "").toLowerCase();
      const phone = (r.tenantId?.phoneNumber || "").toLowerCase();
      return fullname.includes(term) || username.includes(term) || email.includes(term) || phone.includes(term);
    });
  }

  const total = requests.length;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const data = requests.slice(skip, skip + parseInt(limit));

  return { data, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) };
};

/**
 * [MANAGER] Lấy chi tiết một yêu cầu chuyển phòng
 */
const getTransferRequestById = async (requestId) => {
  await _syncPendingTransferRequestsWithPaidInvoices();
  const request = await TransferRequest.findById(requestId)
    .populate({ path: "tenantId", select: "username email phoneNumber" })
    .populate({
      path: "currentRoomId",
      select: "name roomCode",
      populate: [
        { path: "floorId", select: "name" },
        { path: "roomTypeId", select: "typeName currentPrice" },
      ],
    })
    .populate({
      path: "targetRoomId",
      select: "name roomCode",
      populate: [
        { path: "floorId", select: "name" },
        { path: "roomTypeId", select: "typeName currentPrice" },
      ],
    })
    .lean();

  if (!request) throw { status: 404, message: "Không tìm thấy yêu cầu chuyển phòng." };

  if (request.currentRoomId?.roomTypeId?.currentPrice) {
    request.currentRoomId.roomTypeId.currentPrice = parseFloat(
      request.currentRoomId.roomTypeId.currentPrice.toString()
    );
  }
  if (request.targetRoomId?.roomTypeId?.currentPrice) {
    request.targetRoomId.roomTypeId.currentPrice = parseFloat(
      request.targetRoomId.roomTypeId.currentPrice.toString()
    );
  }

  // Gắn fullname từ UserInfo
  if (request.tenantId?._id) {
    const userInfo = await UserInfo.findOne({ userId: request.tenantId._id }).lean();
    request.tenantId.fullname = userInfo?.fullname || null;
  }

  return request;
};

/**
 * [MANAGER] Duyệt yêu cầu chuyển phòng
 * @param {string} requestId
 * @param {string} managerNote - Ghi chú khi duyệt
 */
const approveTransferRequest = async (requestId, managerNote = "") => {
  const request = await TransferRequest.findById(requestId);
  if (!request) throw { status: 404, message: "Không tìm thấy yêu cầu chuyển phòng." };
  if (request.status !== "Pending") {
    throw { status: 400, message: `Không thể duyệt yêu cầu ở trạng thái "${request.status}".` };
  }

  request.status = "Approved";
  request.managerNote = managerNote;
  await request.save();
  return request;
};

/**
 * [MANAGER] Từ chối yêu cầu chuyển phòng
 * @param {string} requestId
 * @param {string} rejectReason - Lý do từ chối (bắt buộc)
 */
const rejectTransferRequest = async (requestId, rejectReason) => {
  if (!rejectReason || !rejectReason.trim()) {
    throw { status: 400, message: "Lý do từ chối là bắt buộc." };
  }
  const request = await TransferRequest.findById(requestId);
  if (!request) throw { status: 404, message: "Không tìm thấy yêu cầu chuyển phòng." };
  if (request.status !== "Pending") {
    throw { status: 400, message: `Không thể từ chối yêu cầu ở trạng thái "${request.status}".` };
  }

  request.status = "Rejected";
  request.rejectReason = rejectReason.trim();
  await request.save();
  return request;
};

/**
 * [TENANT] Hủy yêu cầu chuyển phòng (chỉ khi đang Pending)
 */
const cancelTransferRequest = async (tenantId, requestId) => {
  const request = await TransferRequest.findOne({ _id: requestId, tenantId });
  if (!request) {
    throw { status: 404, message: "Không tìm thấy yêu cầu chuyển phòng." };
  }
  if (request.status !== "Pending") {
    throw {
      status: 400,
      message: `Không thể hủy yêu cầu ở trạng thái "${request.status}". Chỉ có thể hủy khi đang chờ duyệt.`,
    };
  }

  request.status = "Cancelled";
  await request.save();
  return request;
};

/**
 * [MANAGER] Phát hành hóa đơn tính phí chuyển phòng (tiền điện, nước, dịch vụ phòng cũ)
 * Được gọi sau khi duyệt yêu cầu (trước khi thanh toán).
 * @param {string} requestId - ID yêu cầu chuyển phòng
 * @param {string} managerInvoiceNotes - Ghi chú
 * @param {number} electricIndex - Chỉ số điện
 * @param {number} waterIndex - Chỉ số nước
 */
const releaseTransferInvoice = async (requestId, managerInvoiceNotes = "", electricIndex, waterIndex) => {
  console.log(`[TRANSFER] 📄 Manager phát hành hóa đơn chuyển phòng: ${requestId}`);

  const request = await TransferRequest.findById(requestId);
  if (!request) throw { status: 404, message: "Không tìm thấy yêu cầu chuyển phòng." };

  if (request.status !== "Approved") {
    throw { status: 400, message: `Chỉ có thể phát hành hóa đơn khi yêu cầu đã được Approved (hiện tại: ${request.status}).` };
  }

  const contract = await Contract.findById(request.contractId).populate({ path: 'roomId', populate: { path: 'roomTypeId' } });
  if (!contract) throw { status: 404, message: "Không tìm thấy hợp đồng." };

  const room = contract.roomId;
  if (!room) throw { status: 404, message: "Hợp đồng không có thông tin phòng cũ." };

  const parsedElectricIndex = electricIndex !== undefined && electricIndex !== null ? Number(electricIndex) : undefined;
  const parsedWaterIndex = waterIndex !== undefined && waterIndex !== null ? Number(waterIndex) : undefined;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const dueDate = new Date(year, month, 5);
  const invoiceCode = `INV-TR-${contract.contractCode}-${month}${year}`;
  const invoiceTitle = `Hóa đơn điện, nước, dịch vụ tới ngày chuyển phòng tháng ${month}/${year}`;

  const existingInvoice = await InvoicePeriodic.findOne({ invoiceCode, contractId: contract._id });
  if (existingInvoice?.status === 'Paid') {
    throw { status: 400, message: 'Hóa đơn đã được thanh toán, không thể cập nhật.' };
  }

  const invoiceItems = [];
  let totalAmount = 0;

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  const METER_MAX = 99999;

  const [electricService, waterService] = await Promise.all([
    Service.findOne({ name: { $regex: /^(điện|dien)$/i } }),
    Service.findOne({ name: { $regex: /^(nước|nuoc)$/i } }),
  ]);
  const electricServiceId = electricService?._id?.toString();
  const waterServiceId = waterService?._id?.toString();

  // Nhập chỉ số đồng hồ mới nếu có
  if (parsedElectricIndex !== undefined || parsedWaterIndex !== undefined) {
    const manualInputs = [
      { type: 'electric', label: 'điện', inputIndex: parsedElectricIndex, utilityDoc: electricService },
      { type: 'water', label: 'nước', inputIndex: parsedWaterIndex, utilityDoc: waterService },
    ].filter(item => item.inputIndex !== undefined && item.utilityDoc?._id);

    for (const manualInput of manualInputs) {
      const latestUtilityReading = await MeterReading.findOne({ roomId: room._id, utilityId: manualInput.utilityDoc._id })
        .sort({ readingDate: -1, createdAt: -1 }).populate('utilityId');

      const previousIndex = Number(latestUtilityReading?.newIndex) || 0;
      const finalNewIndex = Number(manualInput.inputIndex);

      const TWO_MINUTES = 2 * 60 * 1000;
      const isRecentReading = latestUtilityReading?.createdAt && (Date.now() - new Date(latestUtilityReading.createdAt).getTime()) < TWO_MINUTES;

      if (isRecentReading) {
        latestUtilityReading.newIndex = finalNewIndex;
        latestUtilityReading.usageAmount = finalNewIndex - previousIndex;
        await latestUtilityReading.save();
        console.log(`[TRANSFER] 🔄 Sửa chỉ số ${manualInput.label}: ${previousIndex} → ${finalNewIndex}`);
      } else {
        const usage = finalNewIndex - previousIndex;
        await MeterReading.create({
          roomId: room._id,
          utilityId: manualInput.utilityDoc._id,
          oldIndex: previousIndex,
          newIndex: finalNewIndex,
          usageAmount: Math.max(0, usage),
          readingDate: new Date()
        });
        console.log(`[TRANSFER] 📝 Ghi chỉ số ${manualInput.label} mới: ${previousIndex} → ${finalNewIndex}`);
      }
    }
  }

  // Tính tiền điện nước từ MeterReading
  const recentReadingsForAll = await MeterReading.find({
    roomId: room._id,
    createdAt: { $gte: startOfMonth, $lte: endOfMonth }
  }).sort({ createdAt: -1 }).populate('utilityId');

  const allReadings = recentReadingsForAll.length > 0
    ? recentReadingsForAll
    : await MeterReading.find({ roomId: room._id }).sort({ createdAt: -1 }).limit(20).populate('utilityId');

  const latestReadings = {};
  allReadings.forEach((reading) => {
    if (!reading.utilityId) return;
    const uId = reading.utilityId._id.toString();
    if (!latestReadings[uId]) {
      latestReadings[uId] = { current: reading, previous: null, count: 1 };
    } else if (latestReadings[uId].count === 1) {
      latestReadings[uId].previous = reading;
      latestReadings[uId].count = 2;
    }
  });

  Object.values(latestReadings).forEach(({ current, previous }) => {
    const newIndex = Number(current.newIndex) || 0;
    let oldIndex, usage;

    if (previous) {
      oldIndex = Number(previous.newIndex) || 0;
      usage = newIndex - oldIndex;
      if (usage < 0) usage = (METER_MAX - oldIndex) + newIndex;
    } else {
      oldIndex = Number(current.oldIndex) || 0;
      usage = newIndex - oldIndex;
      if (usage < 0) usage = (METER_MAX - oldIndex) + newIndex;
    }

    if (usage <= 0) return;

    let servicePrice = current.utilityId.currentPrice || current.utilityId.price || 0;
    servicePrice = typeof servicePrice === 'object' && servicePrice.$numberDecimal ? parseFloat(servicePrice.$numberDecimal) : Number(servicePrice) || 0;

    const amount = usage * servicePrice;
    totalAmount += amount;
    const serviceName = current.utilityId.name || current.utilityId.serviceName || "Dịch vụ";

    invoiceItems.push({
      itemName: `Tiền ${serviceName.toLowerCase()}`,
      oldIndex,
      newIndex,
      usage,
      unitPrice: servicePrice,
      amount,
      isIndex: true
    });
  });

  // Tính tiền dịch vụ mở rộng từ BookService của phòng cũ
  const contractBookServices = await BookService.find({ contractId: contract._id }).populate('services.serviceId');
  const bookServiceItems = contractBookServices.flatMap(doc => Array.isArray(doc.services) ? doc.services : []);

  if (bookServiceItems.length > 0) {
    const transferDay = new Date(request.transferDate);
    transferDay.setHours(23, 59, 59, 999);
    const serviceChargeMap = new Map();

    bookServiceItems.forEach((srvItem) => {
      if (!srvItem?.serviceId) return;
      const startDate = srvItem.startDate ? new Date(srvItem.startDate) : null;
      const endDate = srvItem.endDate ? new Date(srvItem.endDate) : null;

      if (startDate) { startDate.setHours(0, 0, 0, 0); if (startDate > transferDay) return; }
      if (endDate) { endDate.setHours(23, 59, 59, 999); if (endDate < transferDay) return; }

      const srvItemName = srvItem.serviceId.name || srvItem.serviceId.serviceName || "Dịch vụ";
      const srvItemId = srvItem.serviceId._id?.toString();
      if (srvItemId === electricServiceId || srvItemId === waterServiceId) return;

      let srvPrice = srvItem.serviceId.currentPrice || srvItem.serviceId.price || 0;
      srvPrice = typeof srvPrice === 'object' && srvPrice.$numberDecimal ? parseFloat(srvPrice.$numberDecimal) : Number(srvPrice) || 0;
      if (!Number.isFinite(srvPrice) || srvPrice < 0) return;

      const finalQty = Number(srvItem.quantity) || 1;
      const serviceKey = srvItem.serviceId._id ? srvItem.serviceId._id.toString() : `${srvItemName}-${finalQty}-${srvPrice}`;
      const existing = serviceChargeMap.get(serviceKey);
      if (!existing || ((existing.startDate || 0) > (startDate || 0))) {
        serviceChargeMap.set(serviceKey, { itemName: srvItemName, quantity: finalQty, unitPrice: srvPrice, startDate });
      }
    });

    for (const chargeItem of serviceChargeMap.values()) {
      const amount = chargeItem.quantity * chargeItem.unitPrice;
      totalAmount += amount;
      invoiceItems.push({
        itemName: `Dịch vụ ${chargeItem.itemName}`,
        oldIndex: 0, newIndex: 0, usage: chargeItem.quantity, unitPrice: chargeItem.unitPrice, amount, isIndex: false
      });
    }
  }

  // Lưu hóa đơn dịch vụ
  let finalInvoice;
  if (existingInvoice) {
    existingInvoice.title = invoiceTitle;
    existingInvoice.items = invoiceItems;
    existingInvoice.totalAmount = totalAmount;
    existingInvoice.dueDate = dueDate;
    existingInvoice.status = 'Unpaid';
    await existingInvoice.save();
    finalInvoice = existingInvoice;
  } else {
    finalInvoice = await InvoicePeriodic.create({
      invoiceCode, contractId: contract._id, title: invoiceTitle,
      items: invoiceItems, totalAmount, dueDate, status: 'Unpaid',
    });
  }
  console.log(`[TRANSFER] ✅ Hóa đơn dịch vụ: ${finalInvoice._id} | Tổng: ${totalAmount}`);

  // ─── TÍNH CHÊNH LỆCH TIỀN TRẢ TRƯỚC ────────────────────────────────────
  const targetRoomDoc = await Room.findById(request.targetRoomId).populate('roomTypeId', 'currentPrice typeName');
  const oldRoomPrice = extractPrice(room.roomTypeId?.currentPrice);
  const newRoomPrice = extractPrice(targetRoomDoc?.roomTypeId?.currentPrice);

  const availableMonths = calculateAvailableMonths(contract.rentPaidUntil);
  const availableOldAmount = Math.round(availableMonths * oldRoomPrice);
  const availableNewAmount = Math.round(availableMonths * newRoomPrice);
  const difference = availableNewAmount - availableOldAmount; // >0: phải đóng thêm; <0: được hoàn

  console.log(`[TRANSFER] 📅 Tháng khả dụng: ${availableMonths} | Phòng cũ: ${availableOldAmount} | Phòng mới: ${availableNewAmount} | Chênh lệch: ${difference}`);

  // Cập nhật proration vào request
  request.proration = { oldRoomPrice, newRoomPrice, availableMonths, availableOldAmount, availableNewAmount, difference };
  request.transferInvoiceId = finalInvoice._id;
  request.prorationNote = managerInvoiceNotes;

  let prepaidInvoice = null;
  let refundTicket = null;

  if (availableMonths > 0 && difference > 0) {
    // Phòng mới đắt hơn → tạo hóa đơn đóng thêm tiền trả trước
    const now = new Date();
    const datePrefix = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
    const nextSeq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const prepaidCode = `HD-PREPAID-${datePrefix}-${nextSeq}`;

    const formatVN = (d) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const prepaidFrom = new Date(request.transferDate);
    prepaidFrom.setHours(12, 0, 0, 0);

    const isFirstDay = prepaidFrom.getDate() === 1;
    let actualPrepaidFrom = new Date(prepaidFrom);
    if (!isFirstDay) {
      actualPrepaidFrom = new Date(prepaidFrom.getFullYear(), prepaidFrom.getMonth() + 1, 1);
      actualPrepaidFrom.setHours(12, 0, 0, 0);
    }

    const prepaidTo = new Date(actualPrepaidFrom.getFullYear(), actualPrepaidFrom.getMonth() + availableMonths, 0);
    prepaidTo.setHours(12, 0, 0, 0);

    const itemNameDesc = `Đóng thêm tiền phòng trả trước ${availableMonths} tháng (từ ${formatVN(actualPrepaidFrom)} đến ${formatVN(prepaidTo)})`;

    prepaidInvoice = await InvoicePeriodic.create({
      invoiceCode: prepaidCode,
      contractId: contract._id,
      title: `Thanh toán thêm tiền phòng trả trước (${availableMonths} tháng)`,
      items: [{
        itemName: itemNameDesc,
        oldIndex: 0,
        newIndex: 0,
        usage: availableMonths,
        unitPrice: newRoomPrice - oldRoomPrice,
        amount: difference,
        isIndex: false
      }],
      totalAmount: difference,
      dueDate,
      status: 'Unpaid',
    });
    request.prepaidInvoiceId = prepaidInvoice._id;
    console.log(`[TRANSFER] 💰 Hóa đơn đóng thêm: ${difference.toLocaleString('vi-VN')} VND`);

  } else if (availableMonths > 0 && difference < 0) {
    // Phòng cũ thừa tiền → tạo phiếu chi hoàn tiền
    const refundAmount = Math.abs(difference);
    const existingTicket = await FinancialTicket.findOne({ referenceId: request._id, title: { $regex: /^Hoàn tiền chuyển phòng/i } });
    if (!existingTicket) {
      const voucher = await getTransferRefundVoucher();
      refundTicket = await FinancialTicket.create({
        amount: refundAmount,
        title: `Hoàn tiền chuyển phòng - HĐ ${contract.contractCode} (${availableMonths} tháng × ${(oldRoomPrice - newRoomPrice).toLocaleString('vi-VN')} VND)`,
        referenceId: request._id,
        status: 'Approved',
        transactionDate: new Date(),
        paymentVoucher: voucher,
      });
      request.refundTicketId = refundTicket._id;
      console.log(`[TRANSFER] 💸 Phiếu chi hoàn tiền: ${refundAmount.toLocaleString('vi-VN')} VND | Voucher: ${voucher}`);
    } else {
      request.refundTicketId = existingTicket._id;
    }
  }

  request.status = "InvoiceReleased";
  await request.save();

  return { request, invoice: finalInvoice, prepaidInvoice, refundTicket, proration: request.proration };
};

/**
 * [TENANT] Cập nhật yêu cầu chuyển phòng (chỉ khi Pending)
 * @param {string} requestId
 * @param {string} tenantId
 * @param {Object} body - { roomId?, targetRoomId?, transferDate?, reason? }
 */
const updateTransferRequest = async (requestId, tenantId, body) => {
  const request = await TransferRequest.findById(requestId);
  if (!request) {
    throw { status: 404, message: "Yêu cầu chuyển phòng không tồn tại." };
  }
  if (request.tenantId.toString() !== tenantId.toString()) {
    throw { status: 403, message: "Bạn không có quyền chỉnh sửa yêu cầu này." };
  }
  if (request.status !== "Pending") {
    throw { status: 400, message: "Chỉ có thể chỉnh sửa yêu cầu đang ở trạng thái Pending." };
  }

  const { roomId, targetRoomId, transferDate, reason } = body;

  if (!roomId && !targetRoomId && !transferDate && !reason) {
    throw { status: 400, message: "Vui lòng cung cấp ít nhất một trường cần cập nhật." };
  }

  // Nếu đổi phòng hoặc đổi ngày → validate lại
  const newCurrentRoomId = roomId || request.currentRoomId.toString();
  const newTargetRoomId = targetRoomId || request.targetRoomId.toString();
  const newTransferDate = transferDate ? new Date(transferDate) : request.transferDate;

  // Validate ngày (Bắt buộc là ngày mai)
  if (transferDate) {
    const transferDateObj = new Date(transferDate);
    transferDateObj.setHours(0, 0, 0, 0);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    if (transferDateObj.getTime() !== tomorrow.getTime()) {
      throw { status: 400, message: "Ngày chuyển phòng bắt buộc phải là ngày mai." };
    }
  }

  if (roomId || targetRoomId || transferDate) {
    // Lấy hợp đồng để kiểm tra availability
    const contract = await Contract.findById(request.contractId);

    if (roomId) {
      // Validate phòng hiện tại mới
      const currentRoomNew = await Room.findById(roomId);
      if (!currentRoomNew) {
        throw { status: 404, message: "Phòng hiện tại (roomId) không tồn tại." };
      }

      const newContract = await Contract.findOne({ tenantId, roomId, status: { $in: ["active", "inactive"] } });
      if (!newContract) {
        throw { status: 400, message: "Phòng hiện tại không thuộc hợp đồng có hiệu lực của bạn (hoặc hợp đồng đã kết thúc)." };
      }

      if (!currentRoomNew.isActive) {
        throw { status: 400, message: "Phòng hiện tại đang bị tạm ngưng." };
      }
      request.currentRoomId = roomId;
      // Cập nhật lại contract để logic checkAvailability chạy chuẩn theo hợp đồng mới
      contract.endDate = newContract.endDate;
    }

    if (targetRoomId) {
      // Validate phòng mới
      if (targetRoomId === newCurrentRoomId) {
        throw { status: 400, message: "Không thể chuyển vào chính phòng hiện tại của bạn." };
      }
      const targetRoom = await Room.findById(targetRoomId).populate(
        "roomTypeId",
        "typeName personMax",
      );
      if (!targetRoom) {
        throw { status: 404, message: "Phòng muốn chuyển đến không tồn tại." };
      }
      if (targetRoom.status !== "Available") {
        throw { status: 400, message: "Phòng muốn chuyển đến không ở trạng thái Trống (Available)." };
      }
      if (!targetRoom.isActive) {
        throw { status: 400, message: "Phòng muốn chuyển đến đang bị tạm ngưng." };
      }

      // Kiểm tra phòng mới có trống trong khoảng thời gian còn lại của hợp đồng
      const contractEndDate = new Date(contract.endDate);
      const updateAvailability = await checkRoomAvailabilityInPeriod(
        targetRoomId,
        newTransferDate,
        contractEndDate,
      );
      if (!updateAvailability.isAvailable) {
        let conflictInfo = "";
        if (updateAvailability.conflictingContract) {
          const c = updateAvailability.conflictingContract;
          const startStr = c.startDate ? new Date(c.startDate).toLocaleDateString("vi-VN") : "N/A";
          const endStr = c.endDate ? new Date(c.endDate).toLocaleDateString("vi-VN") : "N/A";
          conflictInfo = `Phòng đã có hợp đồng (${c.contractCode || "không mã"}) từ ${startStr} đến ${endStr}.`;
        } else if (updateAvailability.conflictingRequest) {
          const r = updateAvailability.conflictingRequest;
          const transferStr = r.transferDate ? new Date(r.transferDate).toLocaleDateString("vi-VN") : "N/A";
          conflictInfo = `Phòng đã có yêu cầu chuyển phòng được duyệt vào ngày ${transferStr} (${r.tenantId?.username || "không xác định"}).`;
        }
        throw {
          status: 400,
          message: `Phòng muốn chuyển đến không trống trong toàn bộ thời gian còn lại của hợp đồng (đến ${contractEndDate.toLocaleDateString("vi-VN")}). ${conflictInfo} Vui lòng chọn phòng khác hoặc chọn ngày chuyển phù hợp.`,
        };
      }

      const personMax = targetRoom.roomTypeId?.personMax || 1;
      const totalPeople = (contract.coResidents ? contract.coResidents.length : 0) + 1;
      if (totalPeople > personMax) {
        throw {
          status: 400,
          message: `Số người hiện tại (${totalPeople}) vượt quá giới hạn phòng mới (tối đa ${personMax} người).`,
        };
      }

      request.targetRoomId = targetRoomId;
    } else if (transferDate) {
      // Chỉ đổi ngày → kiểm tra phòng hiện tại (targetRoomId đã chọn) có trống đến endDate với ngày mới không
      const contractEndDate = new Date(contract.endDate);
      const dateChangeAvailability = await checkRoomAvailabilityInPeriod(
        request.targetRoomId.toString(),
        newTransferDate,
        contractEndDate,
      );
      if (!dateChangeAvailability.isAvailable) {
        let conflictInfo = "";
        if (dateChangeAvailability.conflictingContract) {
          const c = dateChangeAvailability.conflictingContract;
          const startStr = c.startDate ? new Date(c.startDate).toLocaleDateString("vi-VN") : "N/A";
          const endStr = c.endDate ? new Date(c.endDate).toLocaleDateString("vi-VN") : "N/A";
          conflictInfo = `Phòng đã có hợp đồng (${c.contractCode || "không mã"}) từ ${startStr} đến ${endStr}.`;
        } else if (dateChangeAvailability.conflictingRequest) {
          const r = dateChangeAvailability.conflictingRequest;
          const transferStr = r.transferDate ? new Date(r.transferDate).toLocaleDateString("vi-VN") : "N/A";
          conflictInfo = `Phòng đã có yêu cầu chuyển phòng được duyệt vào ngày ${transferStr} (${r.tenantId?.username || "không xác định"}).`;
        }
        throw {
          status: 400,
          message: `Với ngày chuyển mới, phòng đã chọn không còn trống trong toàn bộ thời gian còn lại của hợp đồng (đến ${contractEndDate.toLocaleDateString("vi-VN")}). ${conflictInfo} Vui lòng chọn ngày khác hoặc chọn phòng khác.`,
        };
      }
    }
  }

  if (transferDate) request.transferDate = newTransferDate;
  if (reason) request.reason = reason;

  await request.save();

  // Populate để trả về thông tin đầy đủ
  const populated = await TransferRequest.findById(request._id)
    .populate({ path: "currentRoomId", select: "name roomCode", populate: { path: "floorId", select: "name" } })
    .populate({
      path: "targetRoomId",
      select: "name roomCode",
      populate: [
        { path: "floorId", select: "name" },
        { path: "roomTypeId", select: "typeName currentPrice" },
      ],
    })
    .lean();

  if (populated.targetRoomId?.roomTypeId?.currentPrice) {
    populated.targetRoomId.roomTypeId.currentPrice = parseFloat(
      populated.targetRoomId.roomTypeId.currentPrice.toString(),
    );
  }

  return populated;
};

/**
 * [TENANT] Xóa yêu cầu chuyển phòng (chỉ khi Pending)
 * @param {string} requestId
 * @param {string} tenantId
 */
const deleteTransferRequest = async (requestId, tenantId) => {
  const request = await TransferRequest.findById(requestId);
  if (!request) {
    throw { status: 404, message: "Yêu cầu chuyển phòng không tồn tại." };
  }
  if (request.tenantId.toString() !== tenantId.toString()) {
    throw { status: 403, message: "Bạn không có quyền xóa yêu cầu này." };
  }
  if (request.status !== "Pending") {
    throw { status: 400, message: "Chỉ có thể xóa yêu cầu đang ở trạng thái Pending." };
  }

  await TransferRequest.findByIdAndDelete(requestId);
  return { message: "Xóa yêu cầu chuyển phòng thành công." };
};

/**
 * Helper: Generate tạo Contract Code mới cho chuyển phòng
 * Format: HN/Room/Year/HDSV/Random3
 */
const generateNewContractCode = (roomName) => {
  const year = new Date().getFullYear();
  const random3 = Math.floor(100 + Math.random() * 900); // 100-999
  return `HN/${roomName}/${year}/HDSV/${random3}`;
};

/**
 * [MANAGER] Hoàn tất chuyển phòng (Bàn giao phòng)
 * Thực hiện khi transfer date đã tới
 * 
 * Các bước:
 * 1. Đóng hợp đồng cũ (status = "terminated")
 * 2. Tạo hợp đồng mới với:
 *    - Phòng mới
 *    - Ngày bắt đầu = ngày chuyển
 *    - Cọc = giữ nguyên từ hợp đồng cũ
 * 3. Cập nhật phòng cũ → Available
 * 4. Cập nhật phòng mới → Occupied
 * 5. Xử lý chênh lệch tiền vào hóa đơn
 * 6. Cập nhật TransferRequest → Completed
 * 
 * @param {string} requestId
 * @returns {Object} Thông tin chuyển phòng đã hoàn tất
 */
const completeTransferRequest = async (requestId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Kiểm tra yêu cầu
    const request = await TransferRequest.findById(requestId).session(session);
    if (!request) {
      throw { status: 404, message: "Không tìm thấy yêu cầu chuyển phòng." };
    }

    if (request.status !== "Paid") {
      throw {
        status: 400,
        message: `Chỉ có thể hoàn tất yêu cầu khi đã thanh toán đầy đủ (Paid). Hiện tại: "${request.status}"`,
      };
    }

    // 1b. Kiểm tra phiếu chi hoàn tiền (nếu có) đã được xử lý
    if (request.refundTicketId) {
      const refundTicket = await FinancialTicket.findById(request.refundTicketId).select('status').lean();
      if (refundTicket && refundTicket.status !== 'Paid') {
        throw {
          status: 400,
          message: `Phiếu chi hoàn tiền chuyển phòng chưa được thanh toán. Vui lòng hoàn tất phiếu chi trước khi bàn giao phòng.`,
        };
      }
    }

    // 2. Kiểm tra ngày hợp lệ (Cho phép hoàn tất từ ngày tạo yêu cầu trở đi)
    const transferDate = new Date(request.transferDate);
    const createdAtDate = new Date(request.createdAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    createdAtDate.setHours(0, 0, 0, 0);

    if (today < createdAtDate) {
      throw {
        status: 400,
        message: `Chưa tới ngày hợp lệ để hoàn tất.`,
      };
    }

    // 3. Lấy hợp đồng cũ và phòng mới
    const oldContract = await Contract.findById(request.contractId)
      .populate("roomId")
      .session(session);
    if (!oldContract) {
      throw { status: 404, message: "Không tìm thấy hợp đồng cũ." };
    }

    const newRoom = await Room.findById(request.targetRoomId)
      .populate("roomTypeId")
      .session(session);
    if (!newRoom) {
      throw { status: 404, message: "Không tìm thấy phòng mới." };
    }

    // 4. Cập nhật phòng cũ → Available
    await Room.findByIdAndUpdate(
      request.currentRoomId,
      { status: "Available" },
      { session }
    );
    console.log(`✅ Phòng cũ (${oldContract.roomId.name}) → Available`);

    // 5. Cập nhật phòng mới → Occupied
    await Room.findByIdAndUpdate(
      request.targetRoomId,
      { status: "Occupied" },
      { session }
    );
    console.log(`✅ Phòng mới (${newRoom.name}) → Occupied`);

    // 6. ĐÓNG HỢP ĐỒNG CŨ - Đặt endDate = ngày chuyển phòng - 1 (23h59p)
    oldContract.status = "terminated";
    const endDateForOldContract = new Date(transferDate.getTime() - 24 * 60 * 60 * 1000);
    endDateForOldContract.setHours(23, 59, 59, 999); // ✅ Đặt thời gian thành 23:59:59
    oldContract.endDate = endDateForOldContract; // ✅ Update ngày chuyển phòng - 1 vào endDate
    await oldContract.save({ session });
    console.log(`📋 Hợp đồng cũ (${oldContract.contractCode}) → terminated`);
    console.log(`   - Ngày kết thúc: ${endDateForOldContract.toLocaleString("vi-VN")}`);

    // 6.5. XÓA CÁC HÓA ĐƠN PREPAID CŨ ĐỂ TRÁNH TÍNH TRÙNG DOANH THU
    // Xóa tất cả HD tiền phòng trả trước (HD-PREPAID-*) thuộc hợp đồng cũ
    const deletedOldPrepaid = await InvoicePeriodic.deleteMany({
      contractId: oldContract._id,
      invoiceCode: { $regex: /^HD-PREPAID-/ },
    }).session(session);
    console.log(`🗑️  Đã xóa ${deletedOldPrepaid.deletedCount} HD prepaid cũ (HĐ ${oldContract.contractCode})`);

    // Xóa HD "đóng thêm tiền phòng trả trước" nếu có (prepaidInvoiceId trên TransferRequest)
    if (request.prepaidInvoiceId) {
      await InvoicePeriodic.findByIdAndDelete(request.prepaidInvoiceId).session(session);
      console.log(`🗑️  Đã xóa HD đóng thêm prepaid: ${request.prepaidInvoiceId}`);
      request.prepaidInvoiceId = null;
    }

    // 7. TẠO HỢP ĐỒNG MỚI
    const newContractCode = generateNewContractCode(newRoom.name);
    const newStartDate = new Date(request.transferDate);

    // Tính ngày kết thúc mới dựa trên duration của hợp đồng cũ
    const newEndDate = new Date(newStartDate);
    newEndDate.setMonth(newEndDate.getMonth() + oldContract.duration);

    const newContract = new Contract({
      contractCode: newContractCode,
      roomId: request.targetRoomId,
      tenantId: oldContract.tenantId,
      depositId: oldContract.depositId, // ✅ GIỮ NGUYÊN CỌC
      coResidents: oldContract.coResidents,
      startDate: newStartDate,
      endDate: newEndDate,
      duration: oldContract.duration,
      status: "active",
      terms: oldContract.terms,
      images: [],
      rentPaidUntil: oldContract.rentPaidUntil,
    });

    await newContract.save({ session });
    console.log(`✅ Hợp đồng mới (${newContractCode}) được tạo`);
    console.log(`   - Phòng: ${newRoom.name}`);
    console.log(`   - Ngày bắt đầu: ${newStartDate.toLocaleDateString("vi-VN")}`);
    console.log(`   - Ngày kết thúc: ${newEndDate.toLocaleDateString("vi-VN")}`);
    console.log(`   - Chuyển dữ liệu:`);
    console.log(`     • CoResidents: ${oldContract.coResidents?.length || 0} người`);
    console.log(`     • CỌC (ID: ${oldContract.depositId ? oldContract.depositId : "N/A"})`);
    console.log(`     • rentPaidUntil mới: ${newContract.rentPaidUntil ? new Date(newContract.rentPaidUntil).toLocaleDateString("vi-VN") : "N/A"} (${request.proration?.availableMonths || 0} tháng khả dụng)`);
    console.log(`     • Terms & Conditions: Giữ nguyên`);

    // 7.2 TẠO BẢN GHI TIỀN PHÒNG TRẢ TRƯỚC CHO HỢP ĐỒNG MỚI
    // Cần thiết để luồng move-out sau này tính hoàn tiền đúng
    const availableMonths = request.proration?.availableMonths || 0;
    if (availableMonths > 0 && newContract.rentPaidUntil) {
      const newRoomPrice = request.proration?.newRoomPrice || 0;
      const newPrepaidAmount = Math.round(availableMonths * newRoomPrice);

      const now = new Date();
      const datePrefix = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
      const nextSeq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const invoiceCode = `HD-PREPAID-${datePrefix}-${nextSeq}`;

      const formatVN = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      };

      const prepaidFrom = new Date(newStartDate);
      prepaidFrom.setHours(12, 0, 0, 0);

      const isFirstDay = prepaidFrom.getDate() === 1;

      let actualPrepaidFrom = new Date(prepaidFrom);
      if (!isFirstDay) {
        // Bắt đầu từ ngày 1 của tháng tiếp theo
        actualPrepaidFrom = new Date(prepaidFrom.getFullYear(), prepaidFrom.getMonth() + 1, 1);
        actualPrepaidFrom.setHours(12, 0, 0, 0);
      }

      const prepaidTo = new Date(actualPrepaidFrom.getFullYear(), actualPrepaidFrom.getMonth() + availableMonths, 0);
      prepaidTo.setHours(12, 0, 0, 0);

      const itemNameDesc = `Tiền thuê phòng trả trước ${availableMonths} tháng (từ ${formatVN(actualPrepaidFrom)} đến ${formatVN(prepaidTo)})`;

      await InvoicePeriodic.create({
        invoiceCode,
        contractId: newContract._id,
        title: `Thanh toán tiền phòng trả trước (${availableMonths} tháng)`,
        items: [{
          itemName: itemNameDesc,
          oldIndex: 0,
          newIndex: 0,
          usage: availableMonths,
          unitPrice: newRoomPrice,
          amount: newPrepaidAmount,
          isIndex: false,
        }],
        totalAmount: newPrepaidAmount,
        dueDate: now,
        status: 'Paid', // Đã thanh toán (chuyển từ hợp đồng cũ sang)
      });
      console.log(`   • Bản ghi tiền phòng trả trước HĐ mới: ${newPrepaidAmount.toLocaleString('vi-VN')} VND (${availableMonths} tháng) → Paid`);
    }

    // 7.5 CHUYỂN DỊCH VỤ TỪ HỢP ĐỒNG CŨ SANG HỢP ĐỒNG MỚI (CỐ ĐỊNH + MỞ RỘNG)
    // LOGIC THANG MÁY: Tầng 1 → Tầng khác = Thêm, Tầng khác → Tầng 1 = Bỏ
    const oldBookService = await BookService.findOne({
      contractId: oldContract._id,
    }).session(session);

    // Lấy thông tin floor của phòng cũ và phòng mới
    const oldRoom = await Room.findById(request.currentRoomId)
      .populate("floorId", "name floorNumber")
      .session(session);
    const newRoomInfo = await Room.findById(request.targetRoomId)
      .populate("floorId", "name floorNumber")
      .session(session);

    const oldFloorNumber = oldRoom?.floorId?.floorNumber || 1;
    const newFloorNumber = newRoomInfo?.floorId?.floorNumber || 1;

    if (oldBookService && oldBookService.services.length > 0) {
      // Lấy danh sách dịch vụ để xác định loại (fixed_monthly hay quantity_based)
      const Service = require("../../service-management/models/service.model");
      const allServices = await Service.find({ isActive: true }).session(session);

      const getCategory = (name) => {
        const n = name.toLowerCase();
        if (n.includes("xe máy") || n.includes("xe đạp"))
          return "quantity_based";
        if (
          n.includes("thang máy") ||
          n.includes("elevator") ||
          n.includes("vệ sinh") ||
          n.includes("điện") ||
          n.includes("nước") ||
          n.includes("internet") ||
          n.includes("wifi")
        )
          return "fixed_monthly";
        return "quantity_based";
      };

      // Build map serviceId -> name
      const serviceNameMap = {};
      allServices.forEach((s) => {
        serviceNameMap[s._id.toString()] = s.name;
      });

      const isElevatorService = (serviceId) => {
        const name = serviceNameMap[serviceId.toString()] || "";
        return name.toLowerCase().includes("thang máy") || name.toLowerCase().includes("elevator");
      };

      // Lọc dịch vụ fixed_monthly và quantity_based từ hợp đồng cũ
      let fixedServices = oldBookService.services.filter((s) => {
        const name = serviceNameMap[s.serviceId.toString()] || "";
        return getCategory(name) === "fixed_monthly";
      });

      const optionalServices = oldBookService.services.filter((s) => {
        const name = serviceNameMap[s.serviceId.toString()] || "";
        return getCategory(name) === "quantity_based";
      });

      // ✅ LOGIC THANG MÁY: 
      // - Từ tầng 1 (oldFloorNumber === 1) lên tầng khác (newFloorNumber > 1) → Thêm thang máy
      // - Từ tầng khác (oldFloorNumber > 1) xuống tầng 1 (newFloorNumber === 1) → Bỏ thang máy
      let elevatorServiceId = null;

      // Tìm serviceId của dịch vụ thang máy
      for (const service of allServices) {
        if (isElevatorService(service._id)) {
          elevatorServiceId = service._id;
          break;
        }
      }

      // Xử lý thêm/bỏ dịch vụ thang máy
      const hasElevator = fixedServices.some((s) => isElevatorService(s.serviceId));

      if (oldFloorNumber === 1 && newFloorNumber > 1 && !hasElevator && elevatorServiceId) {
        // Thêm dịch vụ thang máy
        fixedServices.push({
          serviceId: elevatorServiceId,
          quantity: 1,
          startDate: oldBookService.services[0]?.startDate || oldContract.startDate,
          endDate: null,
        });
        console.log(`   ✅ Thêm dịch vụ thang máy (Tầng 1 → Tầng ${newFloorNumber})`);
      } else if (oldFloorNumber > 1 && newFloorNumber === 1 && hasElevator) {
        // Bỏ dịch vụ thang máy
        fixedServices = fixedServices.filter((s) => !isElevatorService(s.serviceId));
        console.log(`   ✅ Bỏ dịch vụ thang máy (Tầng ${oldFloorNumber} → Tầng 1)`);
      }

      // Tạo BookService mới với tất cả dịch vụ được chuyển
      const allTransferredServices = [
        ...fixedServices.map((s) => ({
          serviceId: s.serviceId,
          quantity: s.quantity || 1,
          startDate: newStartDate,
          endDate: null,
        })),
        ...optionalServices.map((s) => ({
          serviceId: s.serviceId,
          quantity: s.quantity || 1,
          startDate: newStartDate,
          endDate: null,
        })),
      ];

      if (allTransferredServices.length > 0) {
        const newBookService = new BookService({
          contractId: newContract._id,
          services: allTransferredServices,
        });
        await newBookService.save({ session });
        console.log(`   • Dịch vụ cố định: ${fixedServices.length} dịch vụ`);
        console.log(`   • Dịch vụ mở rộng: ${optionalServices.length} dịch vụ`);
        console.log(`   • Tổng cộng: ${allTransferredServices.length} dịch vụ được chuyển`);
      } else {
        console.log(`   • Dịch vụ: Không có dịch vụ nào được chuyển`);
      }
    }

    // 8. Cập nhật TransferRequest → Completed
    request.status = "Completed";
    request.completedAt = new Date();
    request.newContractId = newContract._id; // Lưu ID hợp đồng mới
    await request.save({ session });

    // 11. Commit transaction
    await session.commitTransaction();
    console.log(`✅ Transaction committed thành công`);

    // 12. Populate để trả về thông tin đầy đủ
    const completed = await TransferRequest.findById(requestId)
      .populate({
        path: "currentRoomId",
        select: "name roomCode",
        populate: { path: "floorId", select: "name" },
      })
      .populate({
        path: "targetRoomId",
        select: "name roomCode",
        populate: { path: "floorId", select: "name" },
      })
      .populate("newContractId", "contractCode status roomId")
      .lean();

    return {
      ...completed,
      message: "Chuyển phòng hoàn tất thành công",
      oldContractCode: oldContract.contractCode,
      newContractCode: newContractCode,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error(`❌ Transaction failed:`, error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * [MANAGER] Lấy chỉ số điện nước gần nhất của phòng trong yêu cầu chuyển phòng
 * @param {string} requestId - ID yêu cầu chuyển phòng
 */
const getLatestMeterReadingForTransfer = async (requestId) => {
  const request = await TransferRequest.findById(requestId).lean();
  if (!request) throw { status: 404, message: "Không tìm thấy yêu cầu chuyển phòng." };

  const contract = await Contract.findById(request.contractId).lean();
  if (!contract) throw { status: 404, message: "Không tìm thấy hợp đồng." };

  const roomId = contract.roomId;
  if (!roomId) throw { status: 404, message: "Hợp đồng không có thông tin phòng." };

  const [electricService, waterService] = await Promise.all([
    Service.findOne({ name: { $regex: /^(điện|dien)$/i } }).lean(),
    Service.findOne({ name: { $regex: /^(nước|nuoc)$/i } }).lean(),
  ]);

  const results = { electric: null, water: null };

  if (electricService?._id) {
    const latestElectric = await MeterReading.findOne({ roomId, utilityId: electricService._id })
      .sort({ readingDate: -1, createdAt: -1 })
      .lean();
    if (latestElectric) {
      results.electric = {
        newIndex: latestElectric.newIndex,
        readingDate: latestElectric.readingDate,
      };
    }
  }

  if (waterService?._id) {
    const latestWater = await MeterReading.findOne({ roomId, utilityId: waterService._id })
      .sort({ readingDate: -1, createdAt: -1 })
      .lean();
    if (latestWater) {
      results.water = {
        newIndex: latestWater.newIndex,
        readingDate: latestWater.readingDate,
      };
    }
  }

  return results;
};

module.exports = {
  getAvailableRoomsForTransfer,
  createTransferRequest,
  getMyTransferRequests,
  cancelTransferRequest,
  updateTransferRequest,
  deleteTransferRequest,
  getAllTransferRequestsForManager,
  getTransferRequestById,
  approveTransferRequest,
  rejectTransferRequest,
  releaseTransferInvoice,
  completeTransferRequest,
  getLatestMeterReadingForTransfer,
};

