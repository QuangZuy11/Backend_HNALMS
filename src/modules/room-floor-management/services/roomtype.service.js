const RoomType = require("../models/roomType.model");
const PriceHistory = require("../models/pricehistory.model");
const mongoose = require("mongoose");

class RoomTypeService {
  
  // Hàm phụ trợ: Tạo lịch sử giá (Reusable)
  async _createHistoryRecord(relatedId, price, reason, session) {
    const history = new PriceHistory({
      name: reason || "Cập nhật giá",
      price: price,
      relatedId: relatedId,
      onModel: 'RoomType',
      startDate: new Date(),
      endDate: null
    });
    await history.save({ session });
  }

  // 1. Lấy danh sách
  async getAllRoomTypes() {
    return await RoomType.find().sort({ typeName: 1 }).populate("histories");
  }

  // 2. Lấy chi tiết
  async getRoomTypeById(id) {
    return await RoomType.findById(id).populate("histories");
  }

  // 3. THÊM MỚI LOẠI PHÒNG
  async createRoomType(data) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // B1: Tạo RoomType
      const roomType = new RoomType({
        typeName: data.typeName,
        description: data.description,
        currentPrice: data.currentPrice,
        // --- [MỚI] THÊM DÒNG NÀY ---
        personMax: data.personMax, 
        // --------------------------
        images: data.images,
        status: data.status
      });
      await roomType.save({ session });

      // B2: Tự động ghi Lịch sử giá đầu tiên
      if (data.currentPrice) {
        await this._createHistoryRecord(roomType._id, data.currentPrice, "Giá khởi tạo", session);
      }

      await session.commitTransaction();
      session.endSession();
      return roomType;

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  // 4. SỬA LOẠI PHÒNG
  async updateRoomType(id, data) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const roomType = await RoomType.findById(id);
      if (!roomType) throw new Error("Room Type not found");

      // KIỂM TRA BIẾN ĐỘNG GIÁ
      if (data.currentPrice !== undefined && 
          parseFloat(roomType.currentPrice.toString()) !== parseFloat(data.currentPrice)) {
        
        // B1: Đóng lịch sử cũ
        await PriceHistory.findOneAndUpdate(
          { 
            relatedId: id, 
            onModel: 'RoomType', 
            endDate: null 
          },
          { endDate: new Date() },
          { session }
        );

        // B2: Tạo bản ghi lịch sử mới
        await this._createHistoryRecord(id, data.currentPrice, data.reason || "Cập nhật giá mới", session);

        // B3: Cập nhật giá hiện tại vào bảng chính
        roomType.currentPrice = data.currentPrice;
      }

      // Cập nhật các thông tin khác
      if (data.typeName) roomType.typeName = data.typeName;
      if (data.description) roomType.description = data.description;
      
      // --- [MỚI] THÊM DÒNG NÀY ĐỂ UPDATE SỐ NGƯỜI ---
      if (data.personMax) roomType.personMax = data.personMax;
      // ---------------------------------------------

      if (data.images) roomType.images = data.images;
      if (data.status) roomType.status = data.status;

      await roomType.save({ session });
      
      await session.commitTransaction();
      session.endSession();
      return roomType;

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  // 5. XÓA LOẠI PHÒNG
  async deleteRoomType(id) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const deletedRoomType = await RoomType.findByIdAndDelete(id, { session });
      if (!deletedRoomType) throw new Error("Room Type not found");

      await PriceHistory.deleteMany({ relatedId: id, onModel: 'RoomType' }, { session });

      await session.commitTransaction();
      session.endSession();
      return deletedRoomType;
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}

module.exports = new RoomTypeService();