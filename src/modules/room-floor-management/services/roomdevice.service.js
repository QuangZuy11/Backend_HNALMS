const mongoose = require("mongoose");
const RoomDevice = require("../models/roomdevices.model");
const RoomType = require("../models/roomtype.model");
const Device = require("../models/devices.model");
const Contract = require("../../contract-management/models/contract.model");

/**
 * Lấy danh sách thiết bị của một loại phòng
 * GET /roomdevices?roomTypeId=xxx
 */
exports.getDevicesByRoomType = async (roomTypeId) => {
  if (!roomTypeId) throw { status: 400, message: "roomTypeId là bắt buộc." };

  const roomType = await RoomType.findById(roomTypeId);
  if (!roomType) throw { status: 404, message: "Không tìm thấy loại phòng." };

  return await RoomDevice.find({ roomTypeId })
    .populate("roomTypeId", "typeName description personMax currentPrice")
    .populate("deviceId", "name brand model category unit price")
    .sort({ createdAt: -1 });
};

/**
 * Lấy danh sách tất cả loại phòng để chọn (dropdown)
 * GET /roomdevices/roomtypes-select
 */
exports.getAllRoomTypesForSelect = async () => {
  return await RoomType.find({ status: "active" })
    .select("typeName description personMax currentPrice")
    .sort({ typeName: 1 });
};

/**
 * Lấy chi tiết 1 bản ghi roomdevice
 * GET /roomdevices/:id
 */
exports.getRoomDeviceById = async (id) => {
  const record = await RoomDevice.findById(id)
    .populate("roomTypeId", "typeName description personMax currentPrice")
    .populate("deviceId", "name brand model category unit price");
  if (!record) throw { status: 404, message: "Không tìm thấy bản ghi." };
  return record;
};

/**
 * Thêm thiết bị vào loại phòng
 * POST /roomdevices
 * Body: { roomTypeId, deviceId, quantity }
 */
exports.addDeviceToRoomType = async (data) => {
  const { roomTypeId, deviceId, quantity } = data;

  if (!roomTypeId) throw { status: 400, message: "roomTypeId là bắt buộc." };
  if (!deviceId) throw { status: 400, message: "deviceId là bắt buộc." };

  // Kiểm tra roomType và device tồn tại
  const [roomType, device] = await Promise.all([
    RoomType.findById(roomTypeId),
    Device.findById(deviceId),
  ]);
  if (!roomType) throw { status: 404, message: "Không tìm thấy loại phòng." };
  if (!device) throw { status: 404, message: "Không tìm thấy thiết bị." };

  // Kiểm tra trùng (1 loại phòng không thể có 2 bản ghi cùng thiết bị)
  const existing = await RoomDevice.findOne({ roomTypeId, deviceId });
  if (existing) {
    throw { status: 409, message: "Thiết bị này đã được thêm vào loại phòng này rồi." };
  }

  const record = new RoomDevice({
    roomTypeId,
    deviceId,
    quantity: quantity ?? 1,
  });

  await record.save();

  return await record
    .populate("roomTypeId", "typeName description personMax currentPrice")
    .then((r) => r.populate("deviceId", "name brand model category unit price"));
};

/**
 * Cập nhật số lượng thiết bị trong loại phòng
 * PUT /roomdevices/:id
 * Body: { quantity }
 */
exports.updateRoomDevice = async (id, data) => {
  const { quantity } = data;

  const record = await RoomDevice.findById(id);
  if (!record) throw { status: 404, message: "Không tìm thấy bản ghi." };

  if (quantity !== undefined) {
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      throw { status: 400, message: "Số lượng phải là số nguyên dương (>= 1)." };
    }
    record.quantity = Number(quantity);
  }

  await record.save();

  return await record
    .populate("roomTypeId", "typeName description personMax currentPrice")
    .then((r) => r.populate("deviceId", "name brand model category unit price"));
};

/**
 * Lấy danh sách thiết bị của phòng đang thuê (dành cho Tenant)
 * GET /roomdevices/my-room
 */
exports.getMyRoomDevices = async (tenantId) => {
  if (!tenantId) throw { status: 400, message: "Tenant ID không hợp lệ." };

  const tenantObjectId = mongoose.Types.ObjectId.isValid(tenantId)
    ? new mongoose.Types.ObjectId(tenantId)
    : tenantId;

  // Tìm hợp đồng đang hoạt động của tenant
  const contract = await Contract.findOne({
    tenantId: tenantObjectId,
    status: "active",
  })
    .populate({
      path: "roomId",
      select: "name roomCode roomTypeId",
    })
    .lean();

  if (!contract) {
    throw {
      status: 404,
      message: "Không tìm thấy hợp đồng hoạt động. Bạn không đang thuê phòng nào.",
    };
  }

  const roomTypeId = contract.roomId?.roomTypeId;
  if (!roomTypeId) {
    throw { status: 404, message: "Phòng chưa được gán loại phòng." };
  }

  const devices = await RoomDevice.find({ roomTypeId })
    .populate("deviceId", "name brand model category unit price")
    .sort({ createdAt: -1 })
    .lean();

  return {
    room: {
      _id: contract.roomId._id,
      name: contract.roomId.name,
      roomCode: contract.roomId.roomCode,
    },
    devices,
  };
};

/**
 * Xoá thiết bị khỏi loại phòng
 * DELETE /roomdevices/:id
 */
exports.removeDeviceFromRoomType = async (id) => {
  const record = await RoomDevice.findByIdAndDelete(id);
  if (!record) throw { status: 404, message: "Không tìm thấy bản ghi." };
  return record;
};
