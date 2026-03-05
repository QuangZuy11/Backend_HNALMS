const roomDeviceService = require("../services/roomdevice.service");

const handleError = (res, error) => {
  console.error("🔴 RoomDevice Error:", error);
  const status = error.status || 500;
  const message = error.message || "Lỗi server nội bộ";
  res.status(status).json({ success: false, message });
};

class RoomDeviceController {
  // [GET] /api/roomdevices/roomtypes-select  - Danh s\u00e1ch lo\u1ea1i ph\u00f2ng \u0111\u1ec3 ch\u1ecdn (dropdown)
  async getRoomTypesForSelect(req, res) {
    try {
      const data = await roomDeviceService.getAllRoomTypesForSelect();
      res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
      handleError(res, error);
    }
  }
  // [GET] /api/roomdevices?roomTypeId=xxx
  async getByRoomType(req, res) {
    try {
      const { roomTypeId } = req.query;
      const data = await roomDeviceService.getDevicesByRoomType(roomTypeId);
      res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
      handleError(res, error);
    }
  }

  // [GET] /api/roomdevices/:id
  async getById(req, res) {
    try {
      const data = await roomDeviceService.getRoomDeviceById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  }

  // [POST] /api/roomdevices
  async create(req, res) {
    try {
      const data = await roomDeviceService.addDeviceToRoomType(req.body);
      res.status(201).json({ success: true, message: "Thêm thiết bị vào loại phòng thành công", data });
    } catch (error) {
      handleError(res, error);
    }
  }

  // [PUT] /api/roomdevices/:id
  async update(req, res) {
    try {
      const data = await roomDeviceService.updateRoomDevice(req.params.id, req.body);
      res.status(200).json({ success: true, message: "Cập nhật thiết bị thành công", data });
    } catch (error) {
      handleError(res, error);
    }
  }

  // [DELETE] /api/roomdevices/:id
  async remove(req, res) {
    try {
      await roomDeviceService.removeDeviceFromRoomType(req.params.id);
      res.status(200).json({ success: true, message: "Xoá thiết bị khỏi loại phòng thành công" });
    } catch (error) {
      handleError(res, error);
    }
  }

  // [GET] /api/roomdevices/my-room  - Tenant xem thiết bị phòng đang thuê
  async getMyRoomDevices(req, res) {
    try {
      const tenantId = req.user?.userId || req.user?.id || req.user?._id;
      const data = await roomDeviceService.getMyRoomDevices(tenantId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  }
}

module.exports = new RoomDeviceController();
