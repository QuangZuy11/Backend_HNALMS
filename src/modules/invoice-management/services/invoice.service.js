const Invoice = require("../models/invoice.model");
const Room = require("../../room-floor-management/models/room.model");
const MeterReading = require('../models/meterreading.model'); 

class InvoiceService {
  async getInvoices(query = {}) {
    return await Invoice.find(query).populate("roomId", "name floorId").sort({ createdAt: -1 });
  }

  // 1. CHỨC NĂNG: TẠO HÓA ĐƠN NHÁP HÀNG LOẠT (Tự động lấy tiền phòng + điện nước)
  async generateDraftInvoices() {
    // Tự động tính toán ngày tháng
    const now = new Date();
    const month = now.getMonth() + 1; // getMonth() chạy từ 0-11 nên phải +1
    const year = now.getFullYear();

    // Tính hạn thanh toán (dueDate): Ngày 5 của tháng tiếp theo
    const dueDate = new Date(year, month, 5);

    // Bước 1: Lấy danh sách phòng đang thuê và JOIN sang bảng RoomType để lấy giá tiền
    const activeRooms = await Room.find({ status: "Occupied" }).populate("roomTypeId"); 
    
    if (activeRooms.length === 0) {
      throw new Error("Không có phòng nào đang thuê để tạo hóa đơn.");
    }

    // Bước 2: Tìm các hóa đơn định kỳ đã được tạo cho tháng/năm này để chống trùng lặp
    const titlePattern = `tháng ${month}/${year}`;
    const existingInvoices = await Invoice.find({
      type: "Periodic",
      title: { $regex: titlePattern, $options: "i" }
    });

    const roomIdsWithInvoice = existingInvoices.map(inv => inv.roomId.toString());

    // Bước 3: Lọc ra những phòng CHƯA CÓ hóa đơn
    const roomsToCreate = activeRooms.filter(
      room => !roomIdsWithInvoice.includes(room._id.toString())
    );

    if (roomsToCreate.length === 0) {
      throw new Error(`Tất cả các phòng đang thuê đều đã được tạo hóa đơn cho tháng ${month}/${year}.`);
    }

    // ==========================================
    // BƯỚC 4: LẤY CHỈ SỐ ĐIỆN NƯỚC ĐÃ LƯU TRONG THÁNG
    // ==========================================
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const recentReadings = await MeterReading.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('utilityId'); // Lấy thêm thông tin giá dịch vụ

    // Bước 5: Khởi tạo dữ liệu Hóa đơn Nháp
    const invoicesToCreate = roomsToCreate.map(room => {
      // 5.1. Lấy giá phòng từ RoomType
      const roomPrice = room.roomTypeId ? (room.roomTypeId.currentPrice || 0) : 0;
      const parsedPrice = typeof roomPrice === 'object' && roomPrice.$numberDecimal 
        ? parseFloat(roomPrice.$numberDecimal) 
        : Number(roomPrice) || 0;

      // 5.2. Khởi tạo mảng items và biến tổng tiền
      let totalAmount = parsedPrice;
      const invoiceItems = [
        {
          itemName: "Tiền thuê phòng",
          oldIndex: 0,
          newIndex: 0,
          usage: 1, // Thuê 1 phòng
          unitPrice: parsedPrice,
          amount: parsedPrice 
        }
      ];

      // 5.3. Tìm và cộng dồn các chỉ số điện/nước của phòng này
      const roomReadings = recentReadings.filter(r => r.roomId.toString() === room._id.toString());
      
      roomReadings.forEach(reading => {
        const usage = reading.newIndex - reading.oldIndex;
        
        if (usage > 0 && reading.utilityId) {
          // Lấy giá dịch vụ (Xử lý Decimal128 nếu có)
          let servicePrice = reading.utilityId.price || reading.utilityId.currentPrice || 0;
          servicePrice = typeof servicePrice === 'object' && servicePrice.$numberDecimal 
            ? parseFloat(servicePrice.$numberDecimal) 
            : Number(servicePrice);

          const amount = usage * servicePrice;
          totalAmount += amount; // Cộng dồn vào tổng tiền hóa đơn

          const serviceName = reading.utilityId.name || reading.utilityId.serviceName || "Dịch vụ";

          // Đẩy vào mảng chi tiết
          invoiceItems.push({
            itemName: `Tiền ${serviceName.toLowerCase()} (Cũ: ${reading.oldIndex} - Mới: ${reading.newIndex})`,
            oldIndex: reading.oldIndex,
            newIndex: reading.newIndex,
            usage: usage,
            unitPrice: servicePrice,
            amount: amount
          });
        }
      });

      // 5.4. Trả về cấu trúc lưu DB
      return {
        invoiceCode: `INV-${room.name}-${month}${year}`,
        roomId: room._id,
        title: `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`,
        type: "Periodic",
        items: invoiceItems, // Đã bao gồm Tiền phòng + Điện + Nước
        totalAmount: totalAmount, // Tổng tiền đã được cộng dồn
        dueDate: dueDate,
        status: "Draft" 
      };
    });

    // Lưu hàng loạt vào DB
    const createdInvoices = await Invoice.insertMany(invoicesToCreate);
    return createdInvoices;
  }

  // 2. CHỨC NĂNG: PHÁT HÀNH HÓA ĐƠN
  async releaseInvoice(id) {
    const invoice = await Invoice.findById(id);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn");
    if (invoice.status !== "Draft") throw new Error("Chỉ có thể phát hành hóa đơn ở trạng thái Nháp (Draft)");

    invoice.status = "Unpaid";
    return await invoice.save();
  }

  // 3. LẤY CHI TIẾT HÓA ĐƠN
  async getInvoiceById(id) {
    const invoice = await Invoice.findById(id).populate("roomId", "name floorId");
    if (!invoice) {
      throw new Error("Không tìm thấy hóa đơn này.");
    }
    return invoice;
  }
}

module.exports = new InvoiceService();