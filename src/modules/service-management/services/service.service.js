const Service = require("../models/service.model");

/**
 * Tạo dịch vụ mới
 */
exports.createService = async (data) => {
  // Check trùng tên
  const existingService = await Service.findOne({ name: data.name });
  if (existingService) {
    throw { status: 400, message: "Tên dịch vụ đã tồn tại!" };
  }

  const newService = new Service(data);
  return await newService.save();
};

/**
 * Lấy danh sách dịch vụ (Có hỗ trợ lọc và tìm kiếm)
 */
exports.getAllServices = async (query) => {
  const { type, search, isActive } = query;
  
  let filter = {};

  // Lọc theo loại (Fixed/Extension)
  if (type) {
    filter.type = type;
  }

  // Lọc theo trạng thái hoạt động
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  // Tìm kiếm theo tên
  if (search) {
    filter.name = { $regex: search, $options: "i" }; // Tìm không phân biệt hoa thường
  }

  return await Service.find(filter).sort({ createdAt: -1 });
};
