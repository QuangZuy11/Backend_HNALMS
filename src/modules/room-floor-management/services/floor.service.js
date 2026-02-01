const Floor = require("../models/floor.model");
const Room = require("../models/room.model"); // [QUAN TRỌNG] Import model Room để kiểm tra

class FloorService {
  // Lấy danh sách tất cả các tầng
  async getAllFloors() {
    return await Floor.find().sort({ name: 1 });
  }

  // Lấy chi tiết 1 tầng theo ID
  async getFloorById(id) {
    return await Floor.findById(id);
  }

  // Chức năng THÊM mới tầng
  async createFloor(data) {
    const floor = new Floor(data);
    return await floor.save();
  }

  // Chức năng SỬA tầng
  async updateFloor(id, data) {
    // 1. Kiểm tra xem có phòng nào thuộc tầng này không
    // Lưu ý: Nếu bạn chỉ muốn chặn khi có người ở (Occupied), hãy thêm điều kiện { status: 'occupied' }
    const hasActiveRooms = await Room.exists({ floorId: id });

    if (hasActiveRooms) {
      // Ném ra lỗi để Controller bắt được và trả về client
      throw new Error("Không thể cập nhật thông tin tầng vì đang có phòng hoạt động tại tầng này.");
    }

    return await Floor.findByIdAndUpdate(id, data, { new: true });
  }

  // Chức năng XÓA tầng
  async deleteFloor(id) {
    // 1. Kiểm tra xem có phòng nào thuộc tầng này không
    const hasActiveRooms = await Room.exists({ floorId: id });

    if (hasActiveRooms) {
      throw new Error("Không thể xóa tầng này vì vẫn còn phòng trực thuộc.");
    }

    return await Floor.findByIdAndDelete(id);
  }
}

module.exports = new FloorService();