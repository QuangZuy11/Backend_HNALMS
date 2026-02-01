const Floor = require("../models/floor.model");

class FloorService {
  // Lấy danh sách tất cả các tầng (có thể dùng cho dropdown chọn tầng)
  async getAllFloors() {
    return await Floor.find().sort({ name: 1 }); // Sắp xếp theo tên
  }

  // Lấy chi tiết 1 tầng theo ID
  async getFloorById(id) {
    return await Floor.findById(id);
  }

  // Chức năng THÊM mới tầng
  async createFloor(data) {
    // data bao gồm: name, description, status
    const floor = new Floor(data);
    return await floor.save();
  }

  // Chức năng SỬA tầng
  async updateFloor(id, data) {
    // { new: true } để trả về dữ liệu mới sau khi update thay vì dữ liệu cũ
    return await Floor.findByIdAndUpdate(id, data, { new: true });
  }

  // Chức năng XÓA tầng
  async deleteFloor(id) {
    return await Floor.findByIdAndDelete(id);
  }
}

module.exports = new FloorService();