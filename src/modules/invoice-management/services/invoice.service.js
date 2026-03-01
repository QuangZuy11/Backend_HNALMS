const Invoice = require("../models/invoice.model");
const Room = require("../../room-floor-management/models/room.model");
const MeterReading = require('../models/meterreading.model'); 
// [MỚI] Import model RoomService
const RoomService = require('../../service-management/models/roomservice.model'); 

class InvoiceService {
  async getInvoices(query = {}) {
    return await Invoice.find(query).populate("roomId", "name floorId").sort({ createdAt: -1 });
  }

  // 1. CHỨC NĂNG: TẠO HÓA ĐƠN NHÁP HÀNG LOẠT (Tự động lấy tiền phòng + điện nước + dịch vụ)
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
    // BƯỚC 4.1: LẤY CHỈ SỐ ĐIỆN NƯỚC ĐÃ LƯU TRONG THÁNG
    // ==========================================
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const recentReadings = await MeterReading.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('utilityId'); 

    // ==========================================
    // [MỚI] BƯỚC 4.2: LẤY CÁC DỊCH VỤ ĐANG SỬ DỤNG TRONG THÁNG
    // ==========================================
    const activeServices = await RoomService.find({
      startDate: { $lte: endOfMonth }, // Bắt đầu trước khi tháng này kết thúc
      $or: [
        { endDate: null }, // Chưa có ngày kết thúc (Đang dùng)
        { endDate: { $exists: false } },
        { endDate: { $gte: startOfMonth } } // Hoặc có kết thúc nhưng kết thúc trong/sau tháng này
      ]
    }).populate('serviceId');

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
          usage: 1, 
          unitPrice: parsedPrice,
          amount: parsedPrice 
        }
      ];

      // ==========================================
      // 5.3. CỘNG DỒN TIỀN ĐIỆN / NƯỚC 
      // ==========================================
      const roomReadings = recentReadings.filter(r => r.roomId.toString() === room._id.toString());
      
      // [MỚI] Tạo object để gộp các chỉ số cùng loại (Điện theo Điện, Nước theo Nước)
      const groupedReadings = {};

      roomReadings.forEach(reading => {
        const uId = reading.utilityId._id.toString();
        const usage = reading.newIndex - reading.oldIndex;
        
        if (usage > 0 && reading.utilityId) {
          if (!groupedReadings[uId]) {
            // Nếu chưa có dịch vụ này trong nhóm, thêm mới vào
            groupedReadings[uId] = {
              utilityId: reading.utilityId,
              oldIndex: reading.oldIndex,
              newIndex: reading.newIndex,
              totalUsage: usage
            };
          } else {
            // Nếu đã có rồi (do ghi nhiều lần trong tháng), tiến hành gộp:
            // 1. Lấy số cũ nhất
            groupedReadings[uId].oldIndex = Math.min(groupedReadings[uId].oldIndex, reading.oldIndex);
            // 2. Lấy số mới nhất
            groupedReadings[uId].newIndex = Math.max(groupedReadings[uId].newIndex, reading.newIndex);
            // 3. Cộng dồn lượng sử dụng
            groupedReadings[uId].totalUsage += usage;
          }
        }
      });

      // Sau khi gộp xong, mới bắt đầu tính tiền và đẩy vào Hóa đơn (Chỉ ra 1 dòng duy nhất)
      Object.values(groupedReadings).forEach(group => {
        let servicePrice = group.utilityId.price || group.utilityId.currentPrice || 0;
        servicePrice = typeof servicePrice === 'object' && servicePrice.$numberDecimal 
          ? parseFloat(servicePrice.$numberDecimal) 
          : Number(servicePrice);

        const amount = group.totalUsage * servicePrice;
        totalAmount += amount; // Cộng dồn vào tổng tiền hóa đơn

        const serviceName = group.utilityId.name || group.utilityId.serviceName || "Dịch vụ";
        
        // Đẩy 1 dòng duy nhất vào mảng chi tiết
        invoiceItems.push({
          itemName: `Tiền ${serviceName.toLowerCase()} (Cũ: ${group.oldIndex} - Mới: ${group.newIndex})`,
          oldIndex: group.oldIndex,
          newIndex: group.newIndex,
          usage: group.totalUsage,
          unitPrice: servicePrice,
          amount: amount
        });
      });

      // ==========================================
      // [MỚI] 5.4. CỘNG DỒN TIỀN CÁC DỊCH VỤ PHỤ (Gửi xe, Rác, Wifi...)
      // ==========================================
      const roomServices = activeServices.filter(rs => rs.roomId.toString() === room._id.toString());
      roomServices.forEach(rs => {
        if (rs.serviceId) {
          // Xử lý giá tiền Decimal128
          let srvPrice = rs.serviceId.currentPrice || rs.serviceId.price || 0;
          srvPrice = typeof srvPrice === 'object' && srvPrice.$numberDecimal 
            ? parseFloat(srvPrice.$numberDecimal) 
            : Number(srvPrice);

          const qty = rs.quantity || 1;
          const amount = qty * srvPrice;
          totalAmount += amount;

          const srvName = rs.serviceId.name || rs.serviceId.serviceName || "Dịch vụ";
          
          // Thêm ghi chú (Biển số xe...) vào tên dịch vụ nếu có
          const displayItemName = rs.note ? `Dịch vụ ${srvName} (${rs.note})` : `Dịch vụ ${srvName}`;

          invoiceItems.push({
            itemName: displayItemName,
            oldIndex: 0,
            newIndex: 0,
            usage: qty, // Đẩy số lượng (ví dụ: 2 chiếc xe)
            unitPrice: srvPrice, // Đơn giá 1 chiếc
            amount: amount // Thành tiền
          });
        }
      });

      // 5.5. Trả về cấu trúc lưu DB
      return {
        // Tạo mã hóa đơn random 4 số cuối
        invoiceCode: `INV-${room.name}-${month}${year}-${Math.floor(1000 + Math.random() * 9000)}`,
        roomId: room._id,
        title: `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`,
        type: "Periodic",
        items: invoiceItems, // Đã bao gồm Tiền phòng + Điện/Nước + Dịch vụ
        totalAmount: totalAmount, 
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