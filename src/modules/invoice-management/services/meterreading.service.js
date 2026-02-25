const MeterReading = require("../models/meterreading.model");
const Invoice = require("../models/invoice.model");
const Service = require("../../service-management/models/service.model"); // Import thêm bảng Service để lấy giá tiền

class MeterReadingService {
  // 1. NHẬP CHỈ SỐ MỚI VÀ CẬP NHẬT TRỰC TIẾP VÀO HÓA ĐƠN NHÁP
  async enterReading(data) {
    const usageAmount = data.newIndex - data.oldIndex;
    if (usageAmount < 0) {
      throw new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ");
    }

    // 1. Lưu lịch sử ghi chỉ số vào bảng MeterReading (để lưu vết/thống kê)
    const newReading = new MeterReading({
      ...data,
      usageAmount: usageAmount
    });
    await newReading.save();

    // 2. Tính thành tiền (Lấy giá từ bảng Service)
    const serviceInfo = await Service.findById(data.utilityId);
    if (!serviceInfo) {
      throw new Error("Không tìm thấy thông tin Dịch vụ.");
    }
    
    const unitPrice = serviceInfo.currentPrice || serviceInfo.price || 0; 
    const incurredCost = usageAmount * unitPrice; // Thành tiền
    const serviceName = serviceInfo.name || serviceInfo.serviceName || "Dịch vụ";

    // 3. Cập nhật vào mảng 'items' của Hóa đơn Nháp
    const draftInvoice = await Invoice.findOne({
      roomId: data.roomId,
      type: "Periodic",
      status: "Draft" // Chỉ sửa hóa đơn chưa chốt
    });

    if (draftInvoice) {
      // Tìm xem dịch vụ này đã tồn tại trong mảng items chưa (dựa vào tên)
      const existingItemIndex = draftInvoice.items.findIndex(
        item => item.itemName.toLowerCase() === serviceName.toLowerCase()
      );

      if (existingItemIndex > -1) {
        // NẾU ĐÃ CÓ (Ví dụ nhập sai, giờ nhập lại) => Cập nhật đè lên
        draftInvoice.items[existingItemIndex].oldIndex = data.oldIndex;
        draftInvoice.items[existingItemIndex].newIndex = data.newIndex;
        draftInvoice.items[existingItemIndex].usage = usageAmount;
        draftInvoice.items[existingItemIndex].unitPrice = unitPrice;
        draftInvoice.items[existingItemIndex].amount = incurredCost;
      } else {
        // NẾU CHƯA CÓ => Thêm mới vào mảng
        draftInvoice.items.push({
          itemName: serviceName,
          oldIndex: data.oldIndex,
          newIndex: data.newIndex,
          usage: usageAmount,
          unitPrice: unitPrice,
          amount: incurredCost
        });
      }

      // 4. Tính lại Tổng tiền (Cộng tất cả cột amount trong mảng items lại)
      // Hàm reduce sẽ đi qua từng item, lấy biến sum (bắt đầu từ 0) cộng dồn với item.amount
      draftInvoice.totalAmount = draftInvoice.items.reduce((sum, item) => sum + (item.amount || 0), 0);
      
      // Lưu lại hóa đơn
      await draftInvoice.save();
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