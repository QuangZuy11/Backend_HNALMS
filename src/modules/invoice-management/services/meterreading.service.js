const MeterReading = require("../models/meterreading.model");
const InvoicePeriodic = require("../models/invoice_periodic.model"); 
const Service = require("../../service-management/models/service.model"); 
const Contract = require("../../contract-management/models/contract.model"); 

class MeterReadingService {
  // 1. NHẬP CHỈ SỐ MỚI VÀ CẬP NHẬT TRỰC TIẾP VÀO HÓA ĐƠN NHÁP
  async enterReading(data) {
    // [ĐÃ SỬA] - Tính toán có tính đến trường hợp Reset đồng hồ (vòng qua 999999)
    let usageAmount = data.newIndex - data.oldIndex;
    
    if (data.isReset && usageAmount < 0) {
      const maxLimit = data.maxIndex || 100000; 
      usageAmount = maxLimit - data.oldIndex + data.newIndex;
    }

    if (usageAmount < 0) {
      throw new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ (Trừ khi đồng hồ quay vòng)");
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
    
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    // 3. Tìm Hợp đồng (Bao gồm cả hợp đồng vừa chấm dứt trong tháng này)
    const targetContract = await Contract.findOne({ 
      roomId: data.roomId, 
      startDate: { $lte: endOfMonth },
      $or: [
        { status: "active" },
        { 
          status: { $in: ["expired", "terminated"] }, 
          endDate: { $gte: startOfMonth } 
        }
      ]
    }).sort({ createdAt: -1 });

    if (targetContract) {
      // 4. Tìm Hóa đơn Nháp ĐỊNH KỲ dựa trên contractId
      const draftInvoice = await InvoicePeriodic.findOne({
        contractId: targetContract._id,
        status: "Draft",
        title: { $regex: titlePattern, $options: "i" }
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
          draftInvoice.items[existingItemIndex].isIndex = true;
        } else {
          // NẾU CHƯA CÓ => Thêm mới
          draftInvoice.items.push({
            itemName: formattedItemName,
            oldIndex: data.oldIndex,
            newIndex: data.newIndex,
            usage: usageAmount,
            unitPrice: unitPrice,
            amount: incurredCost,
            isIndex: true 
          });
        }

        // Tính lại Tổng tiền
        draftInvoice.totalAmount = draftInvoice.items.reduce((sum, item) => sum + (item.amount || 0), 0);
        await draftInvoice.save();
      }
    }

    return newReading;
  }

  // 2. CẬP NHẬT CHỈ SỐ
  async updateReading(id, data) {
    const reading = await MeterReading.findById(id);
    if (!reading) throw new Error("Không tìm thấy bản ghi chỉ số");

    const oldIndex = data.oldIndex !== undefined ? data.oldIndex : reading.oldIndex;
    const newIndex = data.newIndex !== undefined ? data.newIndex : reading.newIndex;
    
    // [ĐÃ SỬA] - Tính toán cập nhật khi Edit cũng hỗ trợ Reset đồng hồ
    let newUsageAmount = newIndex - oldIndex;
    
    if (data.isReset && newUsageAmount < 0) {
      const maxLimit = data.maxIndex || 100000;
      newUsageAmount = maxLimit - oldIndex + newIndex;
    }

    if (newUsageAmount < 0) {
      throw new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ (Trừ khi đồng hồ quay vòng)");
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
      
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);

      const targetContract = await Contract.findOne({ 
        roomId: reading.roomId, 
        startDate: { $lte: endOfMonth },
        $or: [
          { status: "active" },
          { 
            status: { $in: ["expired", "terminated"] }, 
            endDate: { $gte: startOfMonth } 
          }
        ]
      }).sort({ createdAt: -1 });

      if (targetContract) {
        const draftInvoice = await InvoicePeriodic.findOne({
          contractId: targetContract._id,
          status: "Draft",
          title: { $regex: titlePattern, $options: "i" }
        });

        if (draftInvoice) {
          const serviceName = serviceInfo ? (serviceInfo.name || serviceInfo.serviceName) : "";
          if (serviceName) {
             const searchKeyword = `tiền ${serviceName.toLowerCase()}`;
             const itemIndex = draftInvoice.items.findIndex(item => item.itemName.toLowerCase().includes(searchKeyword));
             
             if (itemIndex > -1) {
                draftInvoice.items[itemIndex].oldIndex = oldIndex;
                draftInvoice.items[itemIndex].newIndex = newIndex;
                draftInvoice.items[itemIndex].usage = newUsageAmount;
                draftInvoice.items[itemIndex].amount += costDifference;
             }
          }

          draftInvoice.totalAmount = draftInvoice.items.reduce((sum, item) => sum + (item.amount || 0), 0);
          if (draftInvoice.totalAmount < 0) draftInvoice.totalAmount = 0; 
          await draftInvoice.save();
        }
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
    
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const targetContract = await Contract.findOne({ 
      roomId: reading.roomId, 
      startDate: { $lte: endOfMonth },
      $or: [
        { status: "active" },
        { 
          status: { $in: ["expired", "terminated"] }, 
          endDate: { $gte: startOfMonth } 
        }
      ]
    }).sort({ createdAt: -1 });

    if (targetContract) {
      // Tìm hóa đơn nháp liên quan để trừ tiền
      const draftInvoice = await InvoicePeriodic.findOne({
        contractId: targetContract._id,
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
    }

    // Xóa bản ghi trong DB
    await MeterReading.findByIdAndDelete(id);
    return true;
  }
}

module.exports = new MeterReadingService();