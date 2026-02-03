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
const Floor = require("../models/floor.model");
// [LƯU Ý]: Kiểm tra kỹ tên file này, nếu tên file là roomType.model.js thì phải require đúng chữ hoa chữ thường
const RoomType = require("../models/roomType.model");
const xlsx = require("xlsx");

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
  let query = {};
  if (floorId) query.floorId = floorId;
  if (roomTypeId) query.roomTypeId = roomTypeId;
  if (status) query.status = status;
  // Only filter by isActive if explicitly set to false, otherwise show all
  if (isActive === false) query.isActive = false;

  const rooms = await Room.find(query)
    .populate("floorId", "name")
    .populate(
      "roomTypeId",
      "typeName currentPrice images personMax area description",
    )
    .sort({ name: 1 });

  return rooms;
};

exports.getRoomDetail = async (roomId) => {
  const room = await Room.findById(roomId)
    .populate("floorId", "name")
    .populate(
      "roomTypeId",
      "typeName currentPrice description images personMax area",
    );

  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };

  console.log("🔍 getRoomDetail - Room:", room.name);
  console.log("📸 RoomType images:", room.roomTypeId?.images);
  console.log("📊 Images count:", room.roomTypeId?.images?.length);

  const roomAssets = await RoomDevice.find({
    roomTypeId: room.roomTypeId._id,
  }).populate("deviceId", "name brand model type");
  const roomData = room.toObject();
  roomData.assets = roomAssets;
  return roomData;
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

  const typeMap = new Map();
  roomTypes.forEach((t) => typeMap.set(t.typeName.trim().toLowerCase(), t._id));

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
    const roomTypeId = typeMap.get(String(typeName).trim().toLowerCase());

    if (!floorId) {
      errors.push(
        `Dòng ${rowIndex}: Không tìm thấy tầng có tên "${floorName}".`,
      );
      continue;
    }
    if (!roomTypeId) {
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

    validRooms.push({
      roomCode: String(roomCode),
      name: String(name),
      floorId,
      roomTypeId,
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
          "Lỗi DB: Một số Mã phòng hoặc Tên phòng trong file đã tồn tại trên hệ thống.",
      };
    }
    throw dbError;
  }
};
