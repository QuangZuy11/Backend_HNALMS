// const Room = require("../models/room.model");

// class RoomService {
//   async getRooms(filters = {}) {
//     const query = {};

//     if (filters.status && filters.status !== "all") {
//       const statusMap = {
//         available: "Trống",
//         occupied: "Đã thuê",
//         maintenance: "Bảo trì",
//       };
//       query.status = statusMap[filters.status];
//     }

//     if (filters.floor && filters.floor !== "all") {
//       query.floor = parseInt(filters.floor);
//     }

//     if (filters.priceRange && filters.priceRange !== "all") {
//       if (filters.priceRange === "low") {
//         query.price = { $lt: 4000000 };
//       } else if (filters.priceRange === "medium") {
//         query.price = { $gte: 4000000, $lte: 6000000 };
//       } else if (filters.priceRange === "high") {
//         query.price = { $gt: 6000000 };
//       }
//     }

//     return await Room.find(query).sort({ createdAt: -1 });
//   }

//   async getRoomById(id) {
//     return await Room.findById(id);
//   }
// }

// module.exports = new RoomService();

// services/room.service.js
const Room = require("../models/room.model");
const RoomDevice = require("../models/roomdevices.model");
const Device = require("../models/devices.model"); // Ensure Device model is registered
const Floor = require("../models/floor.model");
// [LƯU Ý]: Kiểm tra kỹ tên file này, nếu tên file là roomType.model.js thì phải require đúng chữ hoa chữ thường
const RoomType = require("../models/roomtype.model");
const Contract = require("../../contract-management/models/contract.model");
const Deposit = require("../../contract-management/models/deposit.model");
const xlsx = require("xlsx");
const mongoose = require("mongoose");

// ... (Giữ nguyên các hàm createRoom, updateRoom, getAllRooms... của bạn ở trên)

exports.createRoom = async (data) => {
  const { name, roomCode, floorId, roomTypeId, description, isActive } = data;
  const existingName = await Room.findOne({ name });
  if (existingName) throw { status: 400, message: "Tên phòng đã tồn tại!" };
  const existingCode = await Room.findOne({ roomCode });
  if (existingCode)
    throw { status: 400, message: `Mã phòng ${roomCode} đã tồn tại!` };
  const newRoom = new Room({
    name,
    roomCode,
    floorId,
    roomTypeId,
    description,
    status: "Available",
    isActive: isActive !== undefined ? isActive : true,
  });
  return await newRoom.save();
};

exports.updateRoom = async (roomId, updates) => {
  const room = await Room.findById(roomId);
  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };
  if (
    room.status === "Occupied" &&
    (updates.name || updates.roomCode || updates.floorId || updates.roomTypeId)
  ) {
    throw {
      status: 403,
      message:
        "Phòng đang có khách (Occupied). Không được phép thay đổi cấu trúc.",
    };
  }
  if (updates.name && updates.name !== room.name) {
    const duplicateName = await Room.findOne({ name: updates.name });
    if (duplicateName)
      throw { status: 400, message: "Tên phòng mới bị trùng!" };
  }
  if (updates.roomCode && updates.roomCode !== room.roomCode) {
    const duplicateCode = await Room.findOne({ roomCode: updates.roomCode });
    if (duplicateCode) throw { status: 400, message: "Mã phòng mới bị trùng!" };
  }
  Object.assign(room, updates);
  return await room.save();
};

exports.getAllRooms = async (filters) => {
  const { floorId, roomTypeId, status, isActive } = filters;

  // Xác định role: nếu req.user không có → guest
  const isGuest = !filters._userRole || filters._userRole === "guest";
  const isOwnerOrAdmin = ["owner", "admin", "manager"].includes(filters._userRole);

  let query = {};
  if (floorId) query.floorId = floorId;
  if (roomTypeId) query.roomTypeId = roomTypeId;
  if (status) query.status = status;
  if (isActive === false) query.isActive = false;

  const rooms = await Room.find(query)
    .populate("floorId", "name")
    .populate(
      "roomTypeId",
      "typeName currentPrice images personMax area description",
    )
    .sort({ name: 1 });

  // Find active contracts expiring within 1 month to show "Trống từ DD/MM" on floor map
  const now = new Date();
  const oneMonthFromNow = new Date();
  oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

  const roomIds = rooms.map((r) => r._id);
  const expiringContracts = await Contract.find({
    status: "active",
    endDate: { $gte: now, $lte: oneMonthFromNow },
    roomId: { $in: roomIds },
  })
    .select("roomId endDate")
    .lean();

  // Build map: roomId -> endDate (expiring soon)
  const expiryMap = {};
  expiringContracts.forEach((c) => {
    expiryMap[c.roomId.toString()] = c.endDate;
  });

  // Find ALL active contracts with endDate > 1 month (long-term occupied rooms)
  const allActiveContracts = await Contract.find({
    status: "active",
    endDate: { $gt: oneMonthFromNow },
    roomId: { $in: roomIds },
  })
    .select("roomId startDate endDate")
    .lean();

  // Build map: roomId -> { startDate, endDate } (long-term)
  const activeContractMap = {};
  allActiveContracts.forEach((c) => {
    activeContractMap[c.roomId.toString()] = {
      startDate: c.startDate,
      endDate: c.endDate,
    };
  });

  // Find future contracts for Deposited rooms (status="active", startDate > today, not yet activated)
  // và gom luôn status="inactive" vào cùng map
  const futureContracts = await Contract.find({
    status: "active",
    isActivated: false,
    startDate: { $gt: now },
    roomId: { $in: roomIds },
  })
    .select("roomId startDate endDate depositId status")
    .lean()
    .sort({ startDate: 1 });

  // Build futureContractMap (active)
  const futureContractMap = {};
  futureContracts.forEach((c) => {
    futureContractMap[c.roomId.toString()] = {
      startDate: c.startDate,
      endDate: c.endDate,
      depositId: c.depositId?.toString(),
      status: c.status,
    };
  });

  // Find inactive contracts separately — needed for hasFutureInactiveContract flag
  // even when the room already has a long-term contract (activeContractMap)
  const inactiveContracts = await Contract.find({
    status: "inactive",
    isActivated: false,
    startDate: { $gt: now },
    roomId: { $in: roomIds },
  })
    .select("roomId startDate endDate depositId")
    .lean()
    .sort({ startDate: 1 });

  // Merge inactive contracts INTO futureContractMap
  inactiveContracts.forEach((c) => {
    const roomKey = c.roomId.toString();
    if (!futureContractMap[roomKey]) {
      futureContractMap[roomKey] = {
        startDate: c.startDate,
        endDate: c.endDate,
        depositId: c.depositId?.toString(),
        status: "inactive",
      };
    }
  });

  // Find all "Held" deposits for these rooms to detect floating deposits
  const heldDeposits = await Deposit.find({
    room: { $in: roomIds },
    status: "Held",
  })
    .select("room _id")
    .lean();

  // Find all contracts (active + inactive) to know which deposits are bound
  // Áp dụng cho TẤT CẢ roles — để check floating deposit chính xác
  const allActiveContractsForDeposits = await Contract.find({
    status: { $in: ["active", "inactive"] },
    roomId: { $in: roomIds },
  })
    .select("roomId depositId status")
    .lean();

  // Build map: depositId -> true (bound deposits)
  const boundDepositIds = new Set();
  allActiveContractsForDeposits.forEach((c) => {
    if (c.depositId) {
      boundDepositIds.add(c.depositId.toString());
    }
  });

  // Build map: roomId -> hasFloatingDeposit
  // Deposit bound vào inactive contract KHÔNG coi là floating — phòng available
  // Áp dụng cho TẤT CẢ roles
  const floatingDepositMap = {};
  heldDeposits.forEach((d) => {
    const roomKey = d.room.toString();
    if (!boundDepositIds.has(d._id.toString())) {
      // Deposit không bind bất kỳ contract nào → floating
      floatingDepositMap[roomKey] = true;
    } else {
      // Deposit có bind contract → check xem contract đó có phải inactive không
      const boundContract = allActiveContractsForDeposits.find(
        (c) => c.depositId?.toString() === d._id.toString()
      );
      if (boundContract && boundContract.status === "inactive") {
        // Deposit bind vào inactive contract → không coi là floating (phòng trống)
        // Không set gì
      }
    }
  });

  // Find ANY active contract that is fully activated (isActivated=true)
  // Đây là trường hợp hợp đồng đã có hiệu lực (hoặc < 30 ngày so với ngày bắt đầu)
  // Phòng này sẽ được xem là "Đã thuê" (Occupied) thay vì "Deposited"
  const fullyActivatedContracts = await Contract.find({
    status: "active",
    isActivated: true,
    roomId: { $in: roomIds },
  })
    .select("roomId")
    .lean();

  const fullyActivatedMap = {};
  fullyActivatedContracts.forEach(c => fullyActivatedMap[c.roomId.toString()] = true);

  // Attach date info to rooms:
  // - Expiring soon: contractEndDate only (shows "Trống từ DD/MM")
  // - Long-term occupied: contractStartDate + contractEndDate
  // - Deposited with future contract: contractStartDate (shows "Có người thuê từ DD/MM/YYYY")
  // - hasFloatingDeposit: true if room has a deposit not yet linked to any active contract
  const enrichedRooms = rooms.map((r) => {
    const obj = r.toObject();
    const roomKey = r._id.toString();

    // NẾU CÓ HỢP ĐỒNG ĐÃ ĐƯỢC KÍCH HOẠT THÌ GHI ĐÈ TRẠNG THÁI PHÒNG LÀ OCCUPIED
    if (fullyActivatedMap[roomKey]) {
      obj.status = "Occupied";
    }

    const endDate = expiryMap[roomKey];
    if (endDate) {
      // Expiring soon: only attach contractEndDate
      obj.contractEndDate = endDate;
    } else {
      const active = activeContractMap[roomKey];
      if (active) {
        // Long-term: attach both dates
        obj.contractStartDate = active.startDate;
        obj.contractEndDate = active.endDate;
      } else {
        // Check for future contract (Deposited room)
        const future = futureContractMap[roomKey];
        if (future) {
          // Contract inactive (>30 ngày): luôn hiện green label, KHÔNG hiện !
          // Áp dụng cho TẤT CẢ roles (guest + owner/admin)
          if (future.status === "inactive") {
            // Tính ngày trống = 1 ngày trước startDate
            const startDate = new Date(future.startDate);
            startDate.setDate(startDate.getDate() - 1);
            obj.contractStartDate = startDate;
            obj.contractEndDate = null;
            obj.hasFutureInactiveContract = true;
          } else {
            obj.contractStartDate = future.startDate;
            obj.contractEndDate = future.endDate;
          }
        }
      }
    }

    // Mark if room has a floating deposit (deposit waiting to sign contract)
    obj.hasFloatingDeposit = !!floatingDepositMap[roomKey];

    return obj;
  });

  return enrichedRooms;
};


exports.getRoomDetail = async (roomId) => {
  try {
    const room = await Room.findById(roomId)
      .populate("floorId", "name")
      .populate(
        "roomTypeId",
        "typeName currentPrice description images personMax area",
      );

    if (!room) throw { status: 404, message: "Không tìm thấy phòng" };

    console.log("🔍 getRoomDetail - Room:", room.name);

    let roomAssets = [];
    if (room.roomTypeId) {
      console.log("📸 RoomType found:", room.roomTypeId._id);
      roomAssets = await RoomDevice.find({
        roomTypeId: room.roomTypeId._id,
      }).populate("deviceId", "name brand model"); // Removed 'unit' and 'type' just to be safe, standard fields only
      console.log("✅ RoomAssets found:", roomAssets.length);
    } else {
      console.warn("⚠️ Room has no RoomType assigned:", room.name);
    }

    const roomData = room.toObject();
    if (roomData.roomTypeId && roomData.roomTypeId.currentPrice) {
      roomData.roomTypeId.currentPrice = parseFloat(
        roomData.roomTypeId.currentPrice.toString(),
      );
    }
    roomData.assets = roomAssets;

    // Fetch future contract if any (for Deposited -> short term rental support)
    // Chỉ lấy status="active" vì chỉ có nó mới tính là "sắp có người thuê thật"
    const futureActiveContract = await Contract.findOne({
      roomId: room._id,
      status: "active",
      isActivated: false,
      startDate: { $gt: new Date() }
    }).select("startDate depositId").lean().sort({ startDate: 1 });

    // Lấy contract inactive (>30 ngày) - phòng trống, cho phép đặt cọc
    // Hiện label "Trống đến -> trước ngày active 1 ngày"
    const futureInactiveContract = await Contract.findOne({
      roomId: room._id,
      status: "inactive",
      isActivated: false,
      startDate: { $gt: new Date() }
    }).select("startDate depositId").lean().sort({ startDate: 1 });

    if (futureActiveContract) {
      roomData.futureContractStartDate = futureActiveContract.startDate;
    }
    if (futureInactiveContract) {
      // Tính ngày trống = 1 ngày trước startDate
      const vacantDate = new Date(futureInactiveContract.startDate);
      vacantDate.setDate(vacantDate.getDate() - 1);
      roomData.contractStartDate = vacantDate;
      roomData.contractEndDate = null;
      roomData.futureContractStartDate = futureInactiveContract.startDate;
      roomData.hasFutureInactiveContract = true;
    }

    // Check for floating deposit
    // Deposit bound vào inactive contract → coi như floating (phòng trống)
    const heldDeposits = await Deposit.find({
      room: room._id,
      status: "Held",
    }).select("_id").lean();

    const allContracts = await Contract.find({
      roomId: room._id,
      status: { $in: ["active", "inactive"] },
    }).select("depositId status").lean();

    const boundDepositIds = new Set(
      allContracts
        .filter((c) => c.depositId)
        .map((c) => c.depositId.toString())
    );

    // Deposit bound vào inactive contract KHÔNG tính là floating — phòng available
    const hasFloatingDeposit = heldDeposits.some(
      (d) => {
        if (!boundDepositIds.has(d._id.toString())) {
          // Deposit không bind bất kỳ contract nào -> floating
          return true;
        }
        // Deposit bound nhưng contract là inactive -> KHÔNG coi là floating
        // Vì !hasFloatingDeposit sẽ được xử lý riêng (phòng vẫn trống)
        return false;
      }
    );
    roomData.hasFloatingDeposit = hasFloatingDeposit;

    // NẾU CÓ HỢP ĐỒNG ĐÃ ĐƯỢC KÍCH HOẠT THÌ GHI ĐÈ TRẠNG THÁI PHÒNG LÀ OCCUPIED
    const fullyActivContract = await Contract.findOne({
      roomId: room._id,
      status: "active",
      isActivated: true
    }).select("_id").lean();

    if (fullyActivContract) {
      roomData.status = "Occupied";
      // Nếu phòng đang bị Occupied thì không được xem là đang trống chờ người thuê tương lai, 
      // tránh để FrontEnd hiển thị sai thành "Trống đến -> ..."
      roomData.hasFutureInactiveContract = false;
    }

    return roomData;
  } catch (error) {
    console.error("🔥 Error in getRoomDetail:", error);
    throw error;
  }
};

exports.deleteRoom = async (roomId) => {
  const room = await Room.findById(roomId);
  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };
  if (room.status === "Occupied")
    throw { status: 403, message: "Phòng đang có khách thuê." };
  return await Room.findByIdAndDelete(roomId);
};

exports.toggleStatus = async (roomId, isActive) => {
  const room = await Room.findById(roomId);
  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };
  if (room.status === "Occupied" && isActive === false)
    throw {
      status: 403,
      message: "Phòng đang có người ở, không thể ngừng hoạt động.",
    };
  room.isActive = isActive;
  return await room.save();
};

// ==========================================
//          [TÍNH NĂNG EXCEL]
// ==========================================

exports.generateTemplateBuffer = async () => {
  const headers = [
    ["Mã phòng", "Tên phòng", "Tên tầng", "Tên loại phòng", "Mô tả"],
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(headers);
  xlsx.utils.sheet_add_aoa(
    ws,
    [["P201", "Phòng 201", "Tầng 2", "Studio", "Gần thang máy"]],
    { origin: "A2" },
  );
  ws["!cols"] = [
    { wch: 15 },
    { wch: 25 },
    { wch: 15 },
    { wch: 20 },
    { wch: 30 },
  ];
  xlsx.utils.book_append_sheet(wb, ws, "Mau_Nhap_Phong");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
};

exports.importRoomsFromFile = async (file) => {
  if (!file) throw { status: 400, message: "Vui lòng tải lên file Excel" };

  // Đọc file: Ưu tiên buffer (nếu dùng memoryStorage), sau đó mới đến path
  const data = file.buffer || file.path;
  if (!data)
    throw {
      status: 500,
      message: "Lỗi Server: Không đọc được dữ liệu file (Buffer/Path missing)",
    };

  const workbook = xlsx.read(data, { type: file.buffer ? "buffer" : "file" });
  const sheetName = workbook.SheetNames[0];
  const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  if (rawData.length === 0)
    throw { status: 400, message: "File rỗng, không có dữ liệu." };

  const floors = await Floor.find();
  const roomTypes = await RoomType.find();

  // Tạo Map để tra cứu (Normalize: Trim + LowerCase)
  const floorMap = new Map();
  floors.forEach((f) => floorMap.set(f.name.trim().toLowerCase(), f._id));

  // [SỬA Ở ĐÂY 1] Thay vì chỉ lưu _id, ta lưu trọn bộ object RoomType để lấy được giá
  const typeMap = new Map();
  roomTypes.forEach((t) => typeMap.set(t.typeName.trim().toLowerCase(), t));

  const validRooms = [];
  const errors = [];

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const rowIndex = i + 2;

    const roomCode = row["Mã phòng"];
    const name = row["Tên phòng"];
    const floorName = row["Tên tầng"];
    const typeName = row["Tên loại phòng"];
    const desc = row["Mô tả"] || "";

    if (!roomCode || !name || !floorName || !typeName) {
      errors.push(
        `Dòng ${rowIndex}: Thiếu thông tin bắt buộc (Mã, Tên, Tầng, Loại).`,
      );
      continue;
    }

    const floorId = floorMap.get(String(floorName).trim().toLowerCase());

    // [SỬA Ở ĐÂY 2] Lấy ra object RoomType tương ứng thay vì chỉ lấy ID
    const roomTypeData = typeMap.get(String(typeName).trim().toLowerCase());

    if (!floorId) {
      errors.push(
        `Dòng ${rowIndex}: Không tìm thấy tầng có tên "${floorName}".`,
      );
      continue;
    }
    if (!roomTypeData) {
      errors.push(
        `Dòng ${rowIndex}: Không tìm thấy loại phòng tên "${typeName}".`,
      );
      continue;
    }

    if (validRooms.some((r) => r.roomCode === String(roomCode))) {
      errors.push(
        `Dòng ${rowIndex}: Mã phòng "${roomCode}" bị trùng lặp trong file.`,
      );
      continue;
    }

    // [SỬA Ở ĐÂY 3] Bổ sung thêm trường price (lấy từ currentPrice của loại phòng)
    validRooms.push({
      roomCode: String(roomCode),
      name: String(name),
      floorId,
      roomTypeId: roomTypeData._id, // ID của loại phòng
      price: roomTypeData.currentPrice || 0, // <--- ĐÂY LÀ DÒNG QUAN TRỌNG NHẤT
      personMax: roomTypeData.personMax || 1, // (Tùy chọn) Có thể kế thừa luôn số người tối đa
      description: desc,
      status: "Available",
      isActive: true,
    });
  }

  if (errors.length > 0) {
    const error = new Error("Dữ liệu Excel không hợp lệ");
    error.status = 400;
    error.details = errors;
    throw error;
  }

  try {
    await Room.insertMany(validRooms, { ordered: false });
    return { count: validRooms.length };
  } catch (dbError) {
    if (dbError.code === 11000) {
      throw {
        status: 400,
        message:
          "Lỗi: Một số Mã phòng hoặc Tên phòng trong file đã tồn tại trên hệ thống.",
      };
    }
    throw dbError;
  }
};
// ==========================================
//        [TENANT - VIEW MY ROOM]
// ==========================================

exports.getMyRoom = async (tenantId) => {
  if (!tenantId) {
    throw { status: 400, message: "Tenant ID không hợp lệ" };
  }

  // Convert tenantId sang ObjectId nếu cần
  const tenantObjectId = mongoose.Types.ObjectId.isValid(tenantId)
    ? new mongoose.Types.ObjectId(tenantId)
    : tenantId;

  // Tìm hợp đồng hoạt động của tenant
  const contract = await Contract.findOne({
    tenantId: tenantObjectId,
    status: "active",
  })
    .populate({
      path: "roomId",
      select: "name roomCode status description isActive floorId roomTypeId",
      populate: [
        {
          path: "floorId",
          select: "name description status",
        },
        {
          path: "roomTypeId",
          select: "typeName currentPrice description images personMax status",
        },
      ],
    })
    .populate({
      path: "depositCode",
      select: "name phone email room amount status createdDate",
    })
    .lean();

  if (!contract) {
    throw {
      status: 404,
      message:
        "Không tìm thấy hợp đồng hoạt động. Bạn không đang thuê phòng nào.",
    };
  }

  console.log("✅ Tìm thấy contract:", {
    contractCode: contract.contractCode,
    roomId: contract.roomId?._id,
    depositCode: contract.depositCode?._id,
  });

  // Lấy thiết bị/tài sản của phòng
  let assets = [];
  if (contract.roomId && contract.roomId.roomTypeId) {
    assets = await RoomDevice.find({
      roomTypeId: contract.roomId.roomTypeId._id,
    })
      .populate("deviceId", "name brand model type")
      .lean();
  }

  // Chuẩn bị dữ liệu response
  return {
    contract: {
      _id: contract._id,
      contractCode: contract.contractCode,
      startDate: contract.startDate,
      endDate: contract.endDate,
      status: contract.status,
      image: contract.image || [],
      deposit: contract.depositCode || null,
    },
    room: {
      _id: contract.roomId._id,
      name: contract.roomId.name,
      roomCode: contract.roomId.roomCode,
      status: contract.roomId.status,
      description: contract.roomId.description || "",
      isActive: contract.roomId.isActive,
      floor: contract.roomId.floorId || null,
      roomType: contract.roomId.roomTypeId || null,
      assets: assets || [],
    },
  };
};
