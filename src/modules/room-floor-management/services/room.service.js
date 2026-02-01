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

// ... (Các hàm getAllRooms, getRoomDetail, deleteRoom, toggleStatus giữ nguyên như cũ)
// Bạn nhớ copy lại các hàm đó vào đây hoặc giữ nguyên phần dưới của file cũ
exports.getAllRooms = async (filters) => { /* Code cũ... */ 
  const { floorId, roomTypeId, status, isActive } = filters;
  let query = {};
  if (floorId) query.floorId = floorId;
  if (roomTypeId) query.roomTypeId = roomTypeId;
  if (status) query.status = status;
  if (isActive !== undefined) query.isActive = isActive;

  return await Room.find(query)
    .populate("floorId", "name")
    .populate("roomTypeId", "name price")
    .sort({ name: 1 });
};

exports.getRoomDetail = async (roomId) => { /* Code cũ... */
  const room = await Room.findById(roomId)
    .populate("floorId", "name")
    .populate("roomTypeId", "name price description");

  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };

  const roomAssets = await RoomDevice.find({ roomTypeId: room.roomTypeId._id })
    .populate("deviceId", "name brand model type");

  const roomData = room.toObject();
  roomData.assets = roomAssets;
  return roomData;
};

exports.deleteRoom = async (roomId) => { /* Code cũ... */
  const room = await Room.findById(roomId);
  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };
  if (room.status === "Occupied") {
    throw { status: 403, message: "Phòng đang có khách thuê. Vui lòng thanh lý hợp đồng trước khi xóa." };
  }
  return await Room.findByIdAndDelete(roomId);
};

exports.toggleStatus = async (roomId, isActive) => { /* Code cũ... */
  const room = await Room.findById(roomId);
  if (!room) throw { status: 404, message: "Không tìm thấy phòng" };
  if (room.status === "Occupied" && isActive === false) {
    throw { status: 403, message: "Phòng đang có người ở, không thể ngừng hoạt động." };
  }
  room.isActive = isActive;
  return await room.save();
};