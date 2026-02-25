const Invoice = require("../models/invoice.model");
const Room = require("../../room-floor-management/models/room.model");

class InvoiceService {
  async getInvoices(query = {}) {
    return await Invoice.find(query).populate("roomId", "name floorId").sort({ createdAt: -1 });
  }

  // 1. CHỨC NĂNG: TẠO HÓA ĐƠN NHÁP HÀNG LOẠT (Đã thêm Check Trùng)
  async generateDraftInvoices(data) {
    const { month, year, dueDate } = data;
    
    // Bước 1: Lấy danh sách phòng đang thuê
    // LƯU Ý: Chữ "Đang thuê" này bạn nhớ đổi cho khớp với dữ liệu thực tế trong DB của bạn nhé
    const activeRooms = await Room.find({ status: "Occupied" }); 
    
    if (activeRooms.length === 0) {
      throw new Error("Không có phòng nào đang thuê để tạo hóa đơn.");
    }

    // Bước 2: Tìm các hóa đơn định kỳ đã được tạo cho tháng/năm này
    // Dùng Regex để tìm các hóa đơn có title chứa "tháng M/YYYY"
    const titlePattern = `tháng ${month}/${year}`;
    const existingInvoices = await Invoice.find({
      type: "Periodic",
      title: { $regex: titlePattern, $options: "i" } // $options: "i" để không phân biệt hoa thường
    });

    // Tạo một mảng chứa ID của các phòng ĐÃ CÓ hóa đơn trong tháng này
    const roomIdsWithInvoice = existingInvoices.map(inv => inv.roomId.toString());

    // Bước 3: Lọc ra danh sách những phòng CHƯA CÓ hóa đơn
    const roomsToCreate = activeRooms.filter(
      room => !roomIdsWithInvoice.includes(room._id.toString())
    );

    // Nếu tất cả các phòng đều đã được tạo hóa đơn rồi
    if (roomsToCreate.length === 0) {
      throw new Error(`Tất cả các phòng đang thuê đều đã được tạo hóa đơn cho tháng ${month}/${year}.`);
    }

    // Bước 4: Khởi tạo dữ liệu Hóa đơn Nháp cho các phòng còn lại
    const invoicesToCreate = roomsToCreate.map(room => ({
      // Tạo mã hóa đơn: INV-TênPhòng-ThángNăm-4SốNgẫuNhiên
      invoiceCode: `INV-${room.name}-${month}${year}-${Math.floor(1000 + Math.random() * 9000)}`,
      roomId: room._id,
      title: `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`,
      type: "Periodic",
      totalAmount: room.price || 0, // Tiền phòng gốc (Chưa cộng điện nước)
      dueDate: dueDate,
      status: "Draft" 
    }));

    // Lưu hàng loạt vào Database
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