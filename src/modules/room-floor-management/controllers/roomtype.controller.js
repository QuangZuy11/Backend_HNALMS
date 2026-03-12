const roomTypeService = require("../services/roomtype.service");
const RoomType = require("../models/roomtype.model"); // Cần import model để check trùng tên

class RoomTypeController {
  
  // GET ALL (Giữ nguyên)
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

  // GET ONE (Giữ nguyên)
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

  // CREATE (SỬA ĐỔI: Thêm Validation số người)
  async createRoomType(req, res) {
    try {
      const { typeName, currentPrice, description, personMax } = req.body;

      // 1. Bắt lỗi giá trị đầu vào
      if (!typeName) {
        return res.status(400).json({ success: false, message: "Tên loại phòng là bắt buộc" });
      }
      if (currentPrice === undefined || currentPrice === null || Number(currentPrice) <= 0) {
        return res.status(400).json({ success: false, message: "Giá phòng bắt buộc phải lớn hơn 0" });
      }
      
      // [MỚI] Bắt lỗi số người tối đa
      if (personMax !== undefined && personMax !== null && Number(personMax) <= 0) {
        return res.status(400).json({ success: false, message: "Số người tối đa phải lớn hơn 0" });
      }

      // 2. Bắt lỗi trùng tên loại phòng (Check thủ công trước khi lưu)
      const existingType = await RoomType.findOne({ typeName: typeName.trim() });
      if (existingType) {
        return res.status(400).json({ success: false, message: `Loại phòng mang tên "${typeName}" đã tồn tại!` });
      }

      // 3. Xử lý ảnh
      const images = req.files ? req.files.map(file => file.path) : [];

      const newRT = await roomTypeService.createRoomType({
        typeName: typeName.trim(),
        currentPrice: Number(currentPrice),
        description,
        personMax: personMax ? Number(personMax) : 1, // Nếu không nhập, mặc định là 1
        images: images
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

  // UPDATE (SỬA ĐỔI: Thêm Validation số người)
  async updateRoomType(req, res) {
    try {
      const { typeName, currentPrice, description, personMax, status } = req.body;
      const typeId = req.params.id;

      // 1. Validation Giá phòng
      if (currentPrice !== undefined && (currentPrice === null || Number(currentPrice) <= 0)) {
        return res.status(400).json({ success: false, message: "Giá phòng bắt buộc phải lớn hơn 0" });
      }

      // [MỚI] Validation Số người tối đa
      if (personMax !== undefined && (personMax === null || Number(personMax) <= 0)) {
        return res.status(400).json({ success: false, message: "Số người tối đa phải lớn hơn 0" });
      }

      // 2. Bắt lỗi trùng tên (nếu client có gửi tên mới lên)
      if (typeName) {
        const existingType = await RoomType.findOne({ 
          typeName: typeName.trim(), 
          _id: { $ne: typeId } 
        });
        
        if (existingType) {
          return res.status(400).json({ success: false, message: `Tên loại phòng "${typeName}" đã bị trùng với một loại phòng khác!` });
        }
      }

      // 3. Xử lý ảnh
      const newImages = req.files ? req.files.map(file => file.path) : [];
      let oldImages = req.body.oldImages;
      
      if (!oldImages) {
        oldImages = []; 
      } else if (!Array.isArray(oldImages)) {
        oldImages = [oldImages]; 
      }

      const finalImages = [...oldImages, ...newImages];

      if (finalImages.length > 0 && finalImages.length !== 7) {
        return res.status(400).json({ 
          success: false, 
          message: "Vui lòng cung cấp đủ 7 ảnh cho loại phòng." 
        });
      }

      const updateData = {
        typeName: typeName ? typeName.trim() : undefined,
        currentPrice: currentPrice ? Number(currentPrice) : undefined,
        description,
        personMax: personMax ? Number(personMax) : undefined,
        status,
        images: finalImages.length > 0 ? finalImages : undefined 
      };

      Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

      const updatedRT = await roomTypeService.updateRoomType(typeId, updateData);
      
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

  // DELETE (Giữ nguyên)
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