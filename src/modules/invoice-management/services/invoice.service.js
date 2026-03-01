const Invoice = require("../models/invoice.model");
const Room = require("../../room-floor-management/models/room.model");

class InvoiceService {
  async getInvoices(query = {}) {
    return await Invoice.find(query).populate("roomId", "name floorId").sort({ createdAt: -1 });
  }

// 1. CHỨC NĂNG: TẠO HÓA ĐƠN NHÁP HÀNG LOẠT (Lấy giá từ RoomType & Lưu theo mảng items)
// 1. CHỨC NĂNG: TẠO HÓA ĐƠN NHÁP HÀNG LOẠT (Tự động lấy tháng hiện tại, hạn mùng 5 tháng sau)
  async generateDraftInvoices() {
    // Tự động tính toán ngày tháng
    const now = new Date();
    const month = now.getMonth() + 1; // getMonth() chạy từ 0-11 nên phải +1
    const year = now.getFullYear();

    // Tính hạn thanh toán (dueDate): Ngày 5 của tháng tiếp theo
    // Lưu ý: JS Date rất thông minh, nếu now.getMonth() + 1 là 12 (tháng 13), nó tự nhảy sang tháng 1 năm sau
    const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 5);

    // Bước 1: Lấy danh sách phòng đang thuê và JOIN (populate) sang bảng RoomType để lấy giá tiền
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

    // Bước 4: Khởi tạo dữ liệu Hóa đơn Nháp theo Cấu trúc Mảng (items)
    const invoicesToCreate = roomsToCreate.map(room => {
      // Lấy giá phòng từ RoomType (nếu không có thì mặc định là 0)
      const roomPrice = room.roomTypeId ? (room.roomTypeId.currentPrice || 0) : 0;

      // Xử lý giá trị Decimal128 nếu bạn đang dùng kiểu dữ liệu này trong Mongoose
      const parsedPrice = typeof roomPrice === 'object' && roomPrice.$numberDecimal 
        ? parseFloat(roomPrice.$numberDecimal) 
        : Number(roomPrice) || 0;

      return {
        invoiceCode: `INV-${room.name}-${month}${year}-${Math.floor(1000 + Math.random() * 9000)}`,
        roomId: room._id,
        title: `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`,
        type: "Periodic",
        
        // NHÚNG CHI TIẾT HÓA ĐƠN VÀO ĐÂY
        items: [
          {
            itemName: "Tiền thuê phòng",
            oldIndex: 0,
            newIndex: 0,
            usage: 1, // Thuê 1 phòng
            unitPrice: parsedPrice,
            amount: parsedPrice // Thành tiền = 1 * Giá phòng
          }
        ],

        totalAmount: parsedPrice, // Tổng tiền ban đầu chỉ có tiền phòng
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

  async getInvoiceById(id) {
    const invoice = await Invoice.findById(id).populate("roomId", "name floorId");
    if (!invoice) {
      throw new Error("Không tìm thấy hóa đơn này.");
    }
    return invoice;
  }
}

module.exports = new InvoiceService();