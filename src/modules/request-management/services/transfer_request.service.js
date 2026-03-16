const TransferRequest = require("../models/transfer_request.model");
const Contract = require("../../contract-management/models/contract.model");
const Room = require("../../room-floor-management/models/room.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
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
 * Helper: Tính toán chênh lệch tiền thuê khi chuyển phòng giữa tháng
 * @param {Number} oldPrice - Giá phòng cũ
 * @param {Number} newPrice - Giá phòng mới
 * @param {Date} transferDate - Ngày chuyển phòng
 * @returns {Object} Thông tin proration
 */
const calculateProration = (oldPrice, newPrice, transferDate) => {
  const transfer = new Date(transferDate);
  const dayOfMonth = transfer.getDate();

  // Nếu chuyển vào ngày 1 -> không có chênh lệch tháng này
  if (dayOfMonth === 1) {
    return {
      oldRoomPrice: oldPrice,
      newRoomPrice: newPrice,
      daysRemainingInMonth: 0,
      oldRoomRefund: 0,
      newRoomCharge: 0,
      difference: 0,
    };
  }

  // Chuyển giữa tháng
  const daysInMonth = 30; // Quy ước 30 ngày/tháng theo business rule
  const daysRemaining = daysInMonth - dayOfMonth + 1; // Số ngày còn lại (tính cả ngày chuyển)

  const oldRoomRefund = Math.round((oldPrice / daysInMonth) * daysRemaining);
  const newRoomCharge = Math.round((newPrice / daysInMonth) * daysRemaining);
  const difference = newRoomCharge - oldRoomRefund; // + phải đóng thêm, - được hoàn

  return {
    oldRoomPrice: oldPrice,
    newRoomPrice: newPrice,
    daysRemainingInMonth: daysRemaining,
    oldRoomRefund,
    newRoomCharge,
    difference,
  };
};

/**
 * [TENANT] Lấy danh sách phòng trống để chọn chuyển đến
 */
const getAvailableRoomsForTransfer = async (tenantId) => {
  // Kiểm tra tenant có hợp đồng active không
  const contract = await Contract.findOne({ tenantId, status: "active" });
  if (!contract) {
    throw {
      status: 400,
      message:
        "Bạn không có hợp đồng hiệu lực. Không thể yêu cầu chuyển phòng.",
    };
  }

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

  return { currentContract: contract, availableRooms: data };
};

/**
 * [TENANT] Tạo yêu cầu chuyển phòng
 */
const createTransferRequest = async (tenantId, body) => {
  const { targetRoomId, transferDate, reason } = body;

  // 1. Kiểm tra tenant có hợp đồng active
  const contract = await Contract.findOne({
    tenantId,
    status: "active",
  }).populate({
    path: "roomId",
    populate: { path: "roomTypeId", select: "currentPrice typeName" },
  });

  if (!contract) {
    throw {
      status: 400,
      message:
        "Bạn không có hợp đồng hiệu lực. Không thể yêu cầu chuyển phòng.",
    };
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

  // 3. Kiểm tra phòng mới
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

  // 4. Không cho chuyển vào chính phòng mình
  if (contract.roomId._id.toString() === targetRoomId) {
    throw {
      status: 400,
      message: "Không thể chuyển vào chính phòng bạn đang ở.",
    };
  }

  // 5. Kiểm tra số người ở hiện tại <= personMax phòng mới
  const personMax = targetRoom.roomTypeId?.personMax || 1;
  const totalPeople =
    (contract.coResidents ? contract.coResidents.length : 0) + 1;
  if (totalPeople > personMax) {
    throw {
      status: 400,
      message: `Số người hiện tại (${totalPeople}) vượt quá giới hạn phòng mới (tối đa ${personMax} người).`,
    };
  }

  // 6. Kiểm tra ngày chuyển phòng hợp lệ
  const transferDateObj = new Date(transferDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (transferDateObj < today) {
    throw {
      status: 400,
      message: "Ngày chuyển phòng không được là ngày trong quá khứ.",
    };
  }

  // 7. Tính toán chênh lệch tiền thuê (proration)
  const oldPrice = parseFloat(
    contract.roomId.roomTypeId?.currentPrice?.toString() || "0",
  );
  const newPrice = parseFloat(
    targetRoom.roomTypeId?.currentPrice?.toString() || "0",
  );
  const proration = calculateProration(oldPrice, newPrice, transferDateObj);

  // 8. Tạo yêu cầu
  const transferRequest = new TransferRequest({
    requestCode: generateRequestCode(),
    tenantId,
    contractId: contract._id,
    currentRoomId: contract.roomId._id,
    targetRoomId: targetRoom._id,
    transferDate: transferDateObj,
    reason,
    status: "Pending",
    proration,
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
 * [TENANT] Xem danh sách yêu cầu chuyển phòng của mình
 */
const getMyTransferRequests = async (tenantId) => {
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
 * [TENANT] Cập nhật yêu cầu chuyển phòng (chỉ khi Pending)
 * @param {string} requestId
 * @param {string} tenantId
 * @param {Object} body - { targetRoomId?, transferDate?, reason? }
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

  const { targetRoomId, transferDate, reason } = body;

  if (!targetRoomId && !transferDate && !reason) {
    throw { status: 400, message: "Vui lòng cung cấp ít nhất một trường cần cập nhật." };
  }

  // Nếu đổi phòng hoặc đổi ngày → cần tính lại proration
  const newTargetRoomId = targetRoomId || request.targetRoomId.toString();
  const newTransferDate = transferDate ? new Date(transferDate) : request.transferDate;

  // Validate ngày
  if (transferDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newTransferDate < today) {
      throw { status: 400, message: "Ngày chuyển phòng không được là ngày trong quá khứ." };
    }
  }

  let newProration = request.proration;

  if (targetRoomId || transferDate) {
    // Lấy hợp đồng để biết giá phòng cũ
    const contract = await Contract.findById(request.contractId).populate({
      path: "roomId",
      populate: { path: "roomTypeId", select: "currentPrice" },
    });

    if (targetRoomId) {
      // Validate phòng mới
      if (targetRoomId === request.currentRoomId.toString()) {
        throw { status: 400, message: "Không thể chuyển vào chính phòng bạn đang ở." };
      }
      const targetRoom = await Room.findById(targetRoomId).populate(
        "roomTypeId",
        "currentPrice typeName personMax",
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

      const personMax = targetRoom.roomTypeId?.personMax || 1;
      const totalPeople = (contract.coResidents ? contract.coResidents.length : 0) + 1;
      if (totalPeople > personMax) {
        throw {
          status: 400,
          message: `Số người hiện tại (${totalPeople}) vượt quá giới hạn phòng mới (tối đa ${personMax} người).`,
        };
      }

      const oldPrice = parseFloat(contract.roomId.roomTypeId?.currentPrice?.toString() || "0");
      const newPrice = parseFloat(targetRoom.roomTypeId?.currentPrice?.toString() || "0");
      newProration = calculateProration(oldPrice, newPrice, newTransferDate);
      request.targetRoomId = targetRoomId;
    } else {
      // Chỉ đổi ngày → tính lại proration với phòng hiện tại
      const currentTargetRoom = await Room.findById(request.targetRoomId).populate(
        "roomTypeId",
        "currentPrice",
      );
      const oldPrice = parseFloat(contract.roomId.roomTypeId?.currentPrice?.toString() || "0");
      const newPrice = parseFloat(currentTargetRoom.roomTypeId?.currentPrice?.toString() || "0");
      newProration = calculateProration(oldPrice, newPrice, newTransferDate);
    }
  }

  if (transferDate) request.transferDate = newTransferDate;
  if (reason) request.reason = reason;
  request.proration = newProration;

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

    if (request.status !== "Approved") {
      throw {
        status: 400,
        message: `Chỉ có thể hoàn tất yêu cầu ở trạng thái "Approved". Hiện tại: "${request.status}"`,
      };
    }

    // 2. Kiểm tra ngày chuyển đã tới
    const transferDate = new Date(request.transferDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    transferDate.setHours(0, 0, 0, 0);

    if (transferDate > today) {
      throw {
        status: 400,
        message: `Ngày chuyển phòng chưa tới. Ngày chuyển: ${transferDate.toLocaleDateString("vi-VN")}`,
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
    });

    await newContract.save({ session });
    console.log(`✅ Hợp đồng mới (${newContractCode}) được tạo`);
    console.log(`   - Phòng: ${newRoom.name}`);
    console.log(`   - Ngày bắt đầu: ${newStartDate.toLocaleDateString("vi-VN")}`);
    console.log(`   - Ngày kết thúc: ${newEndDate.toLocaleDateString("vi-VN")}`);
    console.log(`   - Chuyển dữ liệu:`);
    console.log(`     • CoResidents: ${oldContract.coResidents?.length || 0} người`);
    console.log(`     • CỌC (ID: ${oldContract.depositId ? oldContract.depositId : "N/A"})`);
    console.log(`     • Terms & Conditions: Giữ nguyên`);

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
      proration: request.proration,
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
  completeTransferRequest,
};

