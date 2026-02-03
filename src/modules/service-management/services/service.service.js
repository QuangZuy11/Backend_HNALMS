const Service = require("../models/service.model");
const PriceHistory = require("../../room-floor-management/models/pricehistory.model");
const mongoose = require("mongoose");

// --- HÀM PHỤ TRỢ: GHI LỊCH SỬ GIÁ ---
async function _createHistoryRecord(relatedId, price, reason, session) {
  const history = new PriceHistory({
    name: reason || "Cập nhật giá",
    price: price,
    relatedId: relatedId,
    onModel: 'Service', // Đánh dấu đây là lịch sử của Service
    startDate: new Date(),
    endDate: null
  });
  await history.save({ session });
}

/**
 * Tạo dịch vụ mới (Kèm Transaction & Lịch sử giá)
 */
exports.createService = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Check trùng tên
    const existingService = await Service.findOne({ name: data.name }).session(session);
    if (existingService) {
      throw { status: 400, message: "Tên dịch vụ đã tồn tại!" };
    }

    // 2. Tạo Service
    const newService = new Service(data);
    await newService.save({ session });

    // 3. Ghi lịch sử giá khởi tạo (Nếu có giá)
    if (data.currentPrice !== undefined && data.currentPrice !== null) {
      await _createHistoryRecord(newService._id, data.currentPrice, "Giá khởi tạo", session);
    }

    await session.commitTransaction();
    session.endSession();
    return newService;

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

/**
 * Lấy danh sách dịch vụ (Có hỗ trợ lọc, tìm kiếm và populate history)
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

  // Thêm .populate('histories') để lấy dữ liệu lịch sử
  return await Service.find(filter)
    .sort({ createdAt: -1 })
    .populate("histories");
};

/**
 * Cập nhật dịch vụ (Check thay đổi giá để ghi lịch sử)
 */
exports.updateService = async (id, data) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const service = await Service.findById(id).session(session);
    if (!service) throw { status: 404, message: "Không tìm thấy dịch vụ" };

    // 1. Check trùng tên (Nếu có đổi tên)
    if (data.name && data.name !== service.name) {
      const duplicate = await Service.findOne({ name: data.name }).session(session);
      if (duplicate) throw { status: 400, message: "Tên dịch vụ mới đã bị trùng!" };
    }

    // 2. XỬ LÝ LỊCH SỬ GIÁ (Nếu giá thay đổi)
    if (data.currentPrice !== undefined && 
        parseFloat(service.currentPrice) !== parseFloat(data.currentPrice)) {
      
      // B1: Đóng lịch sử cũ (Tìm bản ghi đang active và set endDate)
      await PriceHistory.findOneAndUpdate(
        { 
          relatedId: id, 
          onModel: 'Service', 
          endDate: null 
        },
        { endDate: new Date() },
        { session }
      );

      // B2: Tạo lịch sử mới
      await _createHistoryRecord(id, data.currentPrice, "Cập nhật giá mới", session);
    }

    // 3. Cập nhật dữ liệu chính
    Object.assign(service, data);
    await service.save({ session });

    await session.commitTransaction();
    session.endSession();
    return service;

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

/**
 * Xóa dịch vụ (Xóa cả lịch sử liên quan)
 */
exports.deleteService = async (id) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Lưu ý: Sau này nếu dịch vụ đã được dùng trong hóa đơn (RoomServices) 
    // thì nên chặn xóa hoặc chỉ chuyển isActive = false (Soft delete)
    
    // 1. Xóa Service
    const service = await Service.findByIdAndDelete(id, { session });
    if (!service) throw { status: 404, message: "Không tìm thấy dịch vụ để xóa" };

    // 2. Xóa toàn bộ lịch sử giá liên quan
    await PriceHistory.deleteMany({ relatedId: id, onModel: 'Service' }, { session });

    await session.commitTransaction();
    session.endSession();
    return service;

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};