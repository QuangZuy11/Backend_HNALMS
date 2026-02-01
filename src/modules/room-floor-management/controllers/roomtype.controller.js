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
      const { typeName, currentPrice, description, personMax, images } = req.body;

      if (!typeName || !currentPrice) {
        return res.status(400).json({ success: false, message: "Tên loại phòng và giá là bắt buộc" });
      }

      const newRT = await roomTypeService.createRoomType({
        typeName,
        currentPrice,
        description,
        personMax: personMax || 1, 
        images
      });

      res.status(201).json({
        success: true,
        message: "Tạo loại phòng thành công",
        data: newRT,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ success: false, message: "Tên loại phòng đã tồn tại" });
      }
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  // UPDATE
  async updateRoomType(req, res) {
    try {

      const updateData = {
        typeName: req.body.typeName,
        currentPrice: req.body.currentPrice,
        description: req.body.description,
        personMax: req.body.personMax,
        status: req.body.status,
        images: req.body.images
      };

      Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

      const updatedRT = await roomTypeService.updateRoomType(req.params.id, updateData);
      
      if (!updatedRT) {
         return res.status(404).json({ success: false, message: "Không tìm thấy loại phòng để sửa" });
      }

      res.json({
        success: true,
        message: "Cập nhật thành công",
        data: updatedRT,
      });
    } catch (error) {
       if (error.code === 11000) {
        return res.status(400).json({ success: false, message: "Tên loại phòng mới bị trùng với loại khác" });
      }
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