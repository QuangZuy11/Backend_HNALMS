const roomTypeService = require("../services/roomtype.service");

class RoomTypeController {
  
  // GET ALL
  async getRoomTypes(req, res) {
    try {
      const roomTypes = await roomTypeService.getAllRoomTypes();
      res.json({
        success: true,
        total: roomTypes.length,
        data: roomTypes,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  // GET ONE
  async getRoomTypeById(req, res) {
    try {
      const roomType = await roomTypeService.getRoomTypeById(req.params.id);
      if (!roomType) {
        return res.status(404).json({ success: false, message: "Room Type not found" });
      }
      res.json({ success: true, data: roomType });
    } catch (error) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  // CREATE
  async createRoomType(req, res) {
    try {
      // req.body: { typeName, currentPrice, description, ... }
      const newRT = await roomTypeService.createRoomType(req.body);
      res.status(201).json({
        success: true,
        message: "Tạo loại phòng thành công",
        data: newRT,
      });
    } catch (error) {
      // Xử lý lỗi trùng tên
      if (error.code === 11000) {
        return res.status(400).json({ success: false, message: "Tên loại phòng đã tồn tại" });
      }
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  // UPDATE
  async updateRoomType(req, res) {
    try {
      // req.body: { currentPrice: 5000000, reason: "Tăng giá điện" }
      const updatedRT = await roomTypeService.updateRoomType(req.params.id, req.body);
      res.json({
        success: true,
        message: "Cập nhật thành công",
        data: updatedRT,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  // DELETE
  async deleteRoomType(req, res) {
    try {
      await roomTypeService.deleteRoomType(req.params.id);
      res.json({ success: true, message: "Xóa thành công" });
    } catch (error) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}

module.exports = new RoomTypeController();