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
const Floor = require("../models/floor.model");      // [MỚI]
const RoomType = require("../models/roomtype.model"); // [MỚI]
const xlsx = require("xlsx");                        // [MỚI] Nhớ chạy: npm install xlsx

/**
 * Tạo phòng mới
 */
exports.createRoom = async (data) => {
  const { name, roomCode, floorId, roomTypeId, description, isActive } = data;

  // Check trùng tên
  const existingName = await Room.findOne({ name });
  if (existingName) {
    throw { status: 400, message: "Tên phòng đã tồn tại!" };
  }

  // Check trùng mã phòng (roomCode)
  const existingCode = await Room.findOne({ roomCode });
  if (existingCode) {
    throw { status: 400, message: `Mã phòng ${roomCode} đã tồn tại!` };
  }

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

/**
 * Cập nhật thông tin phòng
 */
exports.updateRoom = async (roomId, updates) => {
  const room = await Room.findById(roomId);
  if (!room) {
    throw { status: 404, message: "Không tìm thấy phòng" };
  }

  // --- RULE: CHẶN KHI CÓ KHÁCH ---
  if (room.status === "Occupied") {
    // Nếu sửa cấu trúc quan trọng (Tên, Mã, Tầng, Loại)
    if (updates.name || updates.roomCode || updates.floorId || updates.roomTypeId) {
      throw {
        status: 403,
        message: "Phòng đang có khách (Occupied). Không được phép thay đổi cấu trúc (Tên, Mã, Tầng, Loại phòng).",
      };
    }
  }

  // Check trùng tên (nếu có sửa tên)
  if (updates.name && updates.name !== room.name) {
    const duplicateName = await Room.findOne({ name: updates.name });
    if (duplicateName) {
      throw { status: 400, message: "Tên phòng mới bị trùng!" };
    }
  }

  // Check trùng mã (nếu có sửa mã)
  if (updates.roomCode && updates.roomCode !== room.roomCode) {
    const duplicateCode = await Room.findOne({ roomCode: updates.roomCode });
    if (duplicateCode) {
      throw { status: 400, message: "Mã phòng mới bị trùng!" };
    }
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
  if (isActive !== undefined) query.isActive = isActive;

  return await Room.find(query)
    .populate("floorId", "name")
    .populate("roomTypeId", "typeName currentPrice images") // [SỬA] Populate đủ field để FE hiển thị
    .sort({ name: 1 });
};

exports.getRoomDetail = async (roomId) => {
  const room = await Room.findById(roomId)
    .populate("floorId", "name")
    .populate("roomTypeId", "typeName currentPrice description images");

  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };

  const roomAssets = await RoomDevice.find({ roomTypeId: room.roomTypeId._id })
    .populate("deviceId", "name brand model type");

  const roomData = room.toObject();
  roomData.assets = roomAssets;
  return roomData;
};

exports.deleteRoom = async (roomId) => {
  const room = await Room.findById(roomId);
  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };
  if (room.status === "Occupied") {
    throw { status: 403, message: "Phòng đang có khách thuê. Vui lòng thanh lý hợp đồng trước khi xóa." };
  }
  return await Room.findByIdAndDelete(roomId);
};

exports.toggleStatus = async (roomId, isActive) => {
  const room = await Room.findById(roomId);
  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };
  if (room.status === "Occupied" && isActive === false) {
    throw { status: 403, message: "Phòng đang có người ở, không thể ngừng hoạt động." };
  }
  room.isActive = isActive;
  return await room.save();
};

// ==========================================
//          [MỚI] TÍNH NĂNG EXCEL
// ==========================================

/**
 * 1. Tạo Buffer file mẫu Excel
 */
exports.generateTemplateBuffer = async () => {
  const headers = [
    ["Mã phòng", "Tên phòng", "Tên tầng", "Tên loại phòng", "Mô tả"]
  ];

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(headers);

  // Data mẫu
  xlsx.utils.sheet_add_aoa(ws, [
    ["P101", "Phòng 101 View Biển", "Tầng 1", "Studio Cao Cấp", "Gần thang máy"]
  ], { origin: "A2" });

  // Độ rộng cột
  ws['!cols'] = [{wch:15}, {wch:25}, {wch:15}, {wch:20}, {wch:30}];
  xlsx.utils.book_append_sheet(wb, ws, "Mau_Nhap_Phong");

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * 2. Xử lý logic nhập file Excel
 */
exports.importRoomsFromFile = async (file) => {
  if (!file) throw { status: 400, message: "Vui lòng tải lên file Excel" };

  // Đọc file
  const workbook = xlsx.read(file.path || file.buffer, { type: file.path ? 'file' : 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  if (rawData.length === 0) throw { status: 400, message: "File rỗng, không có dữ liệu." };

  // Lấy dữ liệu tham chiếu
  const floors = await Floor.find();
  const roomTypes = await RoomType.find();

  // Map: "tên tầng" -> "id" (Chuẩn hóa chữ thường)
  const floorMap = new Map();
  floors.forEach(f => floorMap.set(f.name.trim().toLowerCase(), f._id));

  const typeMap = new Map();
  roomTypes.forEach(t => typeMap.set(t.typeName.trim().toLowerCase(), t._id));

  const validRooms = [];
  const errors = [];

  // Duyệt dữ liệu
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const rowIndex = i + 2;

    const roomCode = row["Mã phòng"];
    const name = row["Tên phòng"];
    const floorName = row["Tên tầng"];
    const typeName = row["Tên loại phòng"];
    const desc = row["Mô tả"] || "";

    if (!roomCode || !name || !floorName || !typeName) {
      errors.push(`Dòng ${rowIndex}: Thiếu thông tin bắt buộc.`);
      continue;
    }

    const floorId = floorMap.get(String(floorName).trim().toLowerCase());
    const roomTypeId = typeMap.get(String(typeName).trim().toLowerCase());

    if (!floorId) {
      errors.push(`Dòng ${rowIndex}: Không tìm thấy tầng "${floorName}".`);
      continue;
    }
    if (!roomTypeId) {
      errors.push(`Dòng ${rowIndex}: Không tìm thấy loại phòng "${typeName}".`);
      continue;
    }

    // Check trùng trong file
    if (validRooms.some(r => r.roomCode === String(roomCode))) {
      errors.push(`Dòng ${rowIndex}: Mã phòng "${roomCode}" bị trùng lặp trong file.`);
      continue;
    }

    validRooms.push({
      roomCode: String(roomCode),
      name: String(name),
      floorId,
      roomTypeId,
      description: desc,
      status: 'Available',
      isActive: true
    });
  }

  if (errors.length > 0) {
    // Ném lỗi về Controller với chi tiết lỗi
    const error = new Error("Dữ liệu không hợp lệ");
    error.status = 400;
    error.details = errors; 
    throw error;
  }

  // Insert DB
  try {
    await Room.insertMany(validRooms, { ordered: false });
    return { count: validRooms.length };
  } catch (dbError) {
    if (dbError.code === 11000) {
       throw { status: 400, message: "Lỗi: Một số Mã phòng trong file đã tồn tại trên hệ thống." };
    }
    throw dbError;
  }
};