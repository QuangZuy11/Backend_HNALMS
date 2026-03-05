const RoomDevice = require("../models/roomdevices.model");
const RoomType = require("../models/roomtype.model");
const Device = require("../models/devices.model");

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
 * Body: { roomTypeId, deviceId, quantity, condition }
 */
exports.addDeviceToRoomType = async (data) => {
  const { roomTypeId, deviceId, quantity, condition } = data;

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
    condition: condition ?? "Good",
  });

  await record.save();

  return await record
    .populate("roomTypeId", "typeName description personMax currentPrice")
    .then((r) => r.populate("deviceId", "name brand model category unit price"));
};

/**
 * Cập nhật số lượng / tình trạng thiết bị trong loại phòng
 * PUT /roomdevices/:id
 * Body: { quantity, condition }
 */
exports.updateRoomDevice = async (id, data) => {
  const { quantity, condition } = data;

  const record = await RoomDevice.findById(id);
  if (!record) throw { status: 404, message: "Không tìm thấy bản ghi." };

  if (quantity !== undefined) {
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      throw { status: 400, message: "Số lượng phải là số nguyên dương (>= 1)." };
    }
    record.quantity = Number(quantity);
  }

  if (condition !== undefined) record.condition = condition;

  await record.save();

  return await record
    .populate("roomTypeId", "typeName description personMax currentPrice")
    .then((r) => r.populate("deviceId", "name brand model category unit price"));
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
