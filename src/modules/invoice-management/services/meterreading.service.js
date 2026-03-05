const MeterReading = require("../models/meterreading.model");
const Invoice = require("../models/invoice.model");
const Service = require("../../service-management/models/service.model"); 

class MeterReadingService {
  // 1. NHẬP CHỈ SỐ MỚI VÀ CẬP NHẬT TRỰC TIẾP VÀO HÓA ĐƠN NHÁP
  async enterReading(data) {
    const usageAmount = data.newIndex - data.oldIndex;
    if (usageAmount < 0) {
      throw new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ");
    }

    // 1. Lưu lịch sử ghi chỉ số vào bảng MeterReading
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
    
    // Xử lý Decimal128 nếu có
    let unitPrice = serviceInfo.currentPrice || serviceInfo.price || 0; 
    unitPrice = typeof unitPrice === 'object' && unitPrice.$numberDecimal ? parseFloat(unitPrice.$numberDecimal) : Number(unitPrice);
    
    const incurredCost = usageAmount * unitPrice; // Thành tiền
    const serviceName = serviceInfo.name || serviceInfo.serviceName || "Dịch vụ";
    
    // Tạo chuỗi định dạng hiển thị cho Hóa đơn 
    const formattedItemName = `Tiền ${serviceName.toLowerCase()}`;
    const searchKeyword = `tiền ${serviceName.toLowerCase()}`; 

    // Tạo chuỗi tìm kiếm Hóa đơn nháp đúng của tháng/năm hiện tại
    const now = new Date();
    const month = now.getMonth() + 1; 
    const year = now.getFullYear();
    const titlePattern = `tháng ${month}/${year}`;

    // 3. Tìm Hóa đơn Nháp của phòng này VÀ của tháng hiện tại
    const draftInvoice = await Invoice.findOne({
      roomId: data.roomId,
      type: "Periodic",
      status: "Draft",
      title: { $regex: titlePattern, $options: "i" } // Đảm bảo không bắt nhầm hóa đơn nháp của tháng trước
    });

    if (draftInvoice) {
      const existingItemIndex = draftInvoice.items.findIndex(
        item => item.itemName.toLowerCase().includes(searchKeyword)
      );

      if (existingItemIndex > -1) {
        // NẾU ĐÃ CÓ => Cập nhật đè lên 
        draftInvoice.items[existingItemIndex].itemName = formattedItemName;
        draftInvoice.items[existingItemIndex].oldIndex = data.oldIndex;
        draftInvoice.items[existingItemIndex].newIndex = data.newIndex;
        draftInvoice.items[existingItemIndex].usage = usageAmount;
        draftInvoice.items[existingItemIndex].unitPrice = unitPrice;
        draftInvoice.items[existingItemIndex].amount = incurredCost;
        draftInvoice.items[existingItemIndex].isIndex = true; // [MỚI] Đảm bảo cờ isIndex vẫn là true khi update
      } else {
        // NẾU CHƯA CÓ => Thêm mới
        draftInvoice.items.push({
          itemName: formattedItemName,
          oldIndex: data.oldIndex,
          newIndex: data.newIndex,
          usage: usageAmount,
          unitPrice: unitPrice,
          amount: incurredCost,
          isIndex: true // [MỚI] Đánh dấu đây là dịch vụ Điện/Nước có chỉ số
        });
      }

      // Tính lại Tổng tiền
      draftInvoice.totalAmount = draftInvoice.items.reduce((sum, item) => sum + (item.amount || 0), 0);
      await draftInvoice.save();
    }

    return newReading;
  }

  // 2. CẬP NHẬT CHỈ SỐ
  async updateReading(id, data) {
    const reading = await MeterReading.findById(id);
    if (!reading) throw new Error("Không tìm thấy bản ghi chỉ số");

    const oldIndex = data.oldIndex !== undefined ? data.oldIndex : reading.oldIndex;
    const newIndex = data.newIndex !== undefined ? data.newIndex : reading.newIndex;
    
    const newUsageAmount = newIndex - oldIndex;
    if (newUsageAmount < 0) {
      throw new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ");
    }

    const usageDifference = newUsageAmount - reading.usageAmount;

    Object.assign(reading, data, { usageAmount: newUsageAmount });
    await reading.save();

    if (usageDifference !== 0) {
      const serviceInfo = await Service.findById(reading.utilityId);
      let unitPrice = serviceInfo ? (serviceInfo.currentPrice || serviceInfo.price || 0) : 0;
      unitPrice = typeof unitPrice === 'object' && unitPrice.$numberDecimal ? parseFloat(unitPrice.$numberDecimal) : Number(unitPrice);
      
      const costDifference = usageDifference * unitPrice;

      const now = new Date();
      const month = now.getMonth() + 1; 
      const year = now.getFullYear();
      const titlePattern = `tháng ${month}/${year}`;

      const draftInvoice = await Invoice.findOne({
        roomId: reading.roomId,
        type: "Periodic",
        status: "Draft",
        title: { $regex: titlePattern, $options: "i" }
      });

      if (draftInvoice) {
        draftInvoice.totalAmount += costDifference; 
        if (draftInvoice.totalAmount < 0) draftInvoice.totalAmount = 0; 
        await draftInvoice.save();
      }
    }

    return reading;
  }

  // 3. LẤY CHỈ SỐ MỚI NHẤT
  async getLatestReading(roomId, utilityId) {
    const latestReading = await MeterReading.findOne({ 
      roomId: roomId, 
      utilityId: utilityId 
    }).sort({ createdAt: -1 });

    return latestReading;
  }

  // ==========================================
  // 4. XÓA BẢN GHI (HOÀN TÁC SỬA SAI)
  // ==========================================
  async deleteReading(id) {
    const reading = await MeterReading.findById(id);
    if (!reading) throw new Error("Không tìm thấy bản ghi để xóa.");

    const now = new Date();
    const month = now.getMonth() + 1; 
    const year = now.getFullYear();
    const titlePattern = `tháng ${month}/${year}`;

    // Tìm hóa đơn nháp liên quan để trừ tiền
    const draftInvoice = await Invoice.findOne({
      roomId: reading.roomId,
      type: "Periodic",
      status: "Draft",
      title: { $regex: titlePattern, $options: "i" }
    });

    if (draftInvoice) {
      const serviceInfo = await Service.findById(reading.utilityId);
      const serviceName = serviceInfo ? (serviceInfo.name || serviceInfo.serviceName) : "";

      if (serviceName) {
        const searchKeyword = `tiền ${serviceName.toLowerCase()}`;

        // Lọc bỏ dịch vụ này ra khỏi mảng items
        draftInvoice.items = draftInvoice.items.filter(
          item => !item.itemName.toLowerCase().includes(searchKeyword)
        );
        
        // Tính toán lại tổng tiền
        draftInvoice.totalAmount = draftInvoice.items.reduce((sum, item) => sum + (item.amount || 0), 0);
        await draftInvoice.save();
      }
    }

    // Xóa bản ghi trong DB
    await MeterReading.findByIdAndDelete(id);
    return true;
  }
}

module.exports = new MeterReadingService();