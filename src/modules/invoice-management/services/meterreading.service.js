const MeterReading = require("../models/meterreading.model");
const Invoice = require("../models/invoice.model");
const Service = require("../../service-management/models/service.model"); // Import thêm bảng Service để lấy giá tiền

class MeterReadingService {
  // 1. NHẬP CHỈ SỐ MỚI VÀ CỘNG TIỀN VÀO HÓA ĐƠN NHÁP
  async enterReading(data) {
    const usageAmount = data.newIndex - data.oldIndex;
    if (usageAmount < 0) {
      throw new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ");
    }

    // Bước 1: Lưu lịch sử ghi chỉ số vào DB
    const newReading = new MeterReading({
      ...data,
      usageAmount: usageAmount
    });
    await newReading.save();

    // Bước 2: Tính thành tiền (Lấy giá từ bảng Service)
    const serviceInfo = await Service.findById(data.utilityId);
    if (!serviceInfo) {
      throw new Error("Không tìm thấy thông tin Dịch vụ (Điện/Nước).");
    }
    
    // Thuộc tính giá trong bảng Service (giả sử là currentPrice như giao diện trước đó)
    const unitPrice = serviceInfo.currentPrice || 0; 
    const incurredCost = usageAmount * unitPrice; // Thành tiền

    // Bước 3: Tìm Hóa đơn Nháp (Draft) của phòng này và cộng dồn tiền
    if (incurredCost > 0) {
      const draftInvoice = await Invoice.findOne({
        roomId: data.roomId,
        type: "Periodic",
        status: "Draft" // Chỉ cộng vào hóa đơn chưa chốt
      });

      if (draftInvoice) {
        draftInvoice.totalAmount += incurredCost; // Cộng dồn tiền điện/nước vào tổng hóa đơn
        await draftInvoice.save();
      }
    }

    return newReading;
  }

  // 2. CẬP NHẬT CHỈ SỐ (Phòng trường hợp nhập sai, sửa lại)
  async updateReading(id, data) {
    const reading = await MeterReading.findById(id);
    if (!reading) throw new Error("Không tìm thấy bản ghi chỉ số");

    const oldIndex = data.oldIndex !== undefined ? data.oldIndex : reading.oldIndex;
    const newIndex = data.newIndex !== undefined ? data.newIndex : reading.newIndex;
    
    const newUsageAmount = newIndex - oldIndex;
    if (newUsageAmount < 0) {
      throw new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ");
    }

    // Tính ra độ chênh lệch lượng sử dụng (có thể tăng thêm hoặc giảm đi do sửa sai)
    const usageDifference = newUsageAmount - reading.usageAmount;

    // Lưu lại chỉ số mới
    Object.assign(reading, data, { usageAmount: newUsageAmount });
    await reading.save();

    // Điều chỉnh lại tiền trong Hóa đơn Draft nếu có thay đổi
    if (usageDifference !== 0) {
      const serviceInfo = await Service.findById(reading.utilityId);
      const unitPrice = serviceInfo ? serviceInfo.currentPrice : 0;
      const costDifference = usageDifference * unitPrice;

      const draftInvoice = await Invoice.findOne({
        roomId: reading.roomId,
        type: "Periodic",
        status: "Draft"
      });

      if (draftInvoice) {
        draftInvoice.totalAmount += costDifference; // Có thể cộng thêm hoặc trừ bớt
        // Đảm bảo tổng tiền không bị âm (phòng lỗi logic)
        if (draftInvoice.totalAmount < 0) draftInvoice.totalAmount = 0; 
        await draftInvoice.save();
      }
    }

    return reading;
  }

  //Hàm lấy chỉ số điện/nước mới nhất của một phòng
  async getLatestReading(roomId, utilityId) {
    // Tìm kiếm bản ghi khớp ID phòng & ID dịch vụ
    // Sắp xếp giảm dần theo ngày tạo (createdAt: -1) để lấy cái mới nhất
    const latestReading = await MeterReading.findOne({ 
      roomId: roomId, 
      utilityId: utilityId 
    }).sort({ createdAt: -1 });

    return latestReading;
  }
}

module.exports = new MeterReadingService();