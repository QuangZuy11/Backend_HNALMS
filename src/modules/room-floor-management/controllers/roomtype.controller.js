const roomTypeService = require("../services/roomtype.service");

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

  // CREATE (SỬA ĐỔI: Xử lý file upload)
  async createRoomType(req, res) {
    try {
      // req.body chứa text data, req.files chứa file ảnh đã upload lên Cloudinary
      const { typeName, currentPrice, description, personMax } = req.body;

      // 1. Lấy danh sách link ảnh từ Cloudinary trả về
      // Nếu có upload file thì map lấy path, nếu không thì mảng rỗng
      const images = req.files ? req.files.map(file => file.path) : [];

      if (!typeName || !currentPrice) {
        return res.status(400).json({ success: false, message: "Tên loại phòng và giá là bắt buộc" });
      }

      const newRT = await roomTypeService.createRoomType({
        typeName,
        currentPrice,
        description,
        personMax: personMax || 1,
        images: images // Lưu mảng URL ảnh vào DB
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

  // UPDATE (SỬA ĐỔI: Xử lý giữ ảnh cũ + thêm ảnh mới)
  async updateRoomType(req, res) {
    try {
      // 1. Xử lý ảnh mới upload (nếu có)
      const newImages = req.files ? req.files.map(file => file.path) : [];

      // 2. Xử lý ảnh cũ muốn giữ lại (Client gửi lên dạng string hoặc array string qua req.body.images)
      let oldImages = req.body.images || [];
      // Nếu chỉ có 1 ảnh cũ, req.body.images sẽ là string -> chuyển thành array
      if (!Array.isArray(oldImages)) {
        oldImages = [oldImages];
      }

      // 3. Gộp ảnh cũ và ảnh mới
      const finalImages = [...oldImages, ...newImages];

      const updateData = {
        typeName: req.body.typeName,
        currentPrice: req.body.currentPrice,
        description: req.body.description,
        personMax: req.body.personMax,
        status: req.body.status,
        images: finalImages.length > 0 ? finalImages : undefined // Chỉ update nếu có ảnh
      };

      // Xóa các trường undefined
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