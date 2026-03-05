const Service = require("../models/service.model");
const BookService = require("../../contract-management/models/bookservice.model");
const Contract = require("../../contract-management/models/contract.model");
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
 * Lấy danh sách dịch vụ đã đăng ký của tenant (qua hợp đồng active)
 * @param {string} tenantId - ID của tenant
 * @returns {Array} Danh sách BookService kèm thông tin dịch vụ và hợp đồng
 */
exports.getBookedServicesByTenant = async (tenantId) => {
  // Tìm hợp đồng đang active của tenant
  const contract = await Contract.findOne({ tenantId, status: "active" }).lean();
  if (!contract) {
    return [];
  }

  const bookService = await BookService.findOne({ contractId: contract._id })
    .populate({
      path: "services.serviceId",
      select: "name currentPrice description type isActive",
    })
    .lean();

  if (!bookService || !bookService.services || bookService.services.length === 0) {
    return [];
  }

  // Chỉ trả về dịch vụ đang hoạt động (endDate = null)
  return bookService.services
    .filter((item) => item.endDate === null || item.endDate === undefined)
    .map((item) => ({
      serviceId: item.serviceId,
      quantity: item.quantity ?? 1,
      startDate: item.startDate,
      contractId: contract._id,
      contractCode: contract.contractCode ?? null,
    }));
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

/**
 * Lấy toàn bộ danh sách dịch vụ cho tenant (Service List Screen)
 * - Fixed: hiển thị, không cho book/huỷ
 * - Extension: hiển thị, cho book nếu chưa đăng ký, cho huỷ nếu đã đăng ký
 * @param {string} tenantId
 */
exports.getAllServicesForTenant = async (tenantId) => {
  const contract = await Contract.findOne({ tenantId, status: "active" }).lean();

  // Dùng Map để lưu cả serviceId -> quantity (chỉ entry đang active: endDate = null)
  let bookedServiceMap = new Map();
  if (contract) {
    const bookService = await BookService.findOne({ contractId: contract._id }).lean();
    if (bookService?.services?.length) {
      bookService.services.forEach((item) => {
        if (item.endDate === null || item.endDate === undefined) {
          bookedServiceMap.set(item.serviceId.toString(), item.quantity ?? 1);
        }
      });
    }
  }

  const services = await Service.find({ isActive: true }).sort({ type: 1, name: 1 }).lean();

  return services.map((svc) => {
    const svcIdStr = svc._id.toString();
    const isBooked = bookedServiceMap.has(svcIdStr);
    const isFixed = svc.type === "Fixed";
    return {
      ...svc,
      isBooked,
      bookedQuantity: isBooked ? bookedServiceMap.get(svcIdStr) : null,
      canBook: !isFixed && !isBooked && !!contract,
      canCancel: !isFixed && isBooked,
    };
  });
};

/**
 * Tenant đăng ký thêm dịch vụ Extension
 * @param {string} tenantId
 * @param {string} serviceId
 * @param {number} quantity
 */
exports.bookServiceForTenant = async (tenantId, serviceId, quantity = 1) => {
  // Validate quantity: phải là số nguyên dương
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw { status: 400, message: "Số lượng người phải là số nguyên dương (>= 1)." };
  }

  const service = await Service.findById(serviceId);
  if (!service) throw { status: 404, message: "Dịch vụ không tồn tại." };
  if (!service.isActive) throw { status: 400, message: "Dịch vụ này hiện không khả dụng." };
  if (service.type === "Fixed") {
    throw { status: 400, message: "Dịch vụ cố định (Fixed) không thể đăng ký thêm." };
  }

  const contract = await Contract.findOne({ tenantId, status: "active" }).lean();
  if (!contract) throw { status: 400, message: "Bạn không có hợp đồng hiệu lực." };

  const serviceObjectId = new mongoose.Types.ObjectId(serviceId);

  // Kiểm tra đang có entry active (endDate = null) chưa
  const activeCheck = await BookService.findOne({
    contractId: contract._id,
    services: { $elemMatch: { serviceId: serviceObjectId, endDate: null } },
  }).lean();
  if (activeCheck) throw { status: 400, message: "Bạn đã đăng ký dịch vụ này rồi." };

  // Thử update entry đã có (làn đăng ký lại sau khi huỷ)
  const updateResult = await BookService.updateOne(
    { contractId: contract._id, "services.serviceId": serviceObjectId },
    {
      $set: {
        "services.$.startDate": new Date(),
        "services.$.endDate": null,
        "services.$.quantity": quantity,
      },
    }
  );

  if (updateResult.matchedCount === 0) {
    // Chưa có doc hoặc chưa có entry → upsert doc và push entry mới
    await BookService.updateOne(
      { contractId: contract._id },
      {
        $push: {
          services: { serviceId: serviceObjectId, quantity, startDate: new Date(), endDate: null },
        },
      },
      { upsert: true }
    );
  }

  return {
    serviceId: service._id,
    name: service.name,
    currentPrice: service.currentPrice,
    type: service.type,
    quantity,
    contractId: contract._id,
  };
};

/**
 * Tenant huỷ đăng ký dịch vụ Extension
 * @param {string} tenantId
 * @param {string} serviceId
 */
exports.cancelBookedServiceForTenant = async (tenantId, serviceId) => {
  const service = await Service.findById(serviceId);
  if (!service) throw { status: 404, message: "Dịch vụ không tồn tại." };
  if (service.type === "Fixed") {
    throw { status: 400, message: "Dịch vụ cố định (Fixed) không thể huỷ đăng ký." };
  }

  const contract = await Contract.findOne({ tenantId, status: "active" }).lean();
  if (!contract) throw { status: 400, message: "Bạn không có hợp đồng hiệu lực." };

  const serviceObjectId = new mongoose.Types.ObjectId(serviceId);

  // Update trực tiếp entry đang active ($elemMatch đảm bảo match đúng 1 phần tử)
  const result = await BookService.updateOne(
    {
      contractId: contract._id,
      services: { $elemMatch: { serviceId: serviceObjectId, endDate: null } },
    },
    { $set: { "services.$.endDate": new Date() } }
  );

  if (result.matchedCount === 0) throw { status: 404, message: "Bạn chưa đăng ký dịch vụ này." };

  return { message: "Huỷ đăng ký dịch vụ thành công." };
};