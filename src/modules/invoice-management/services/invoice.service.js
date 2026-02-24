const Invoice = require("../models/invoice.model");
const Room = require("../../room-floor-management/models/room.model"); // Cần model Room để lấy danh sách phòng đang thuê

class InvoiceService {
  async getInvoices(query = {}) {
    return await Invoice.find(query).populate("roomId", "name floorId").sort({ createdAt: -1 });
  }

  // 1. CHỨC NĂNG: TẠO HÓA ĐƠN NHÁP HÀNG LOẠT (Đầu tháng)
  async generateDraftInvoices(data) {
    const { month, year, dueDate } = data;
    
    // Giả sử các phòng đang thuê có status là 'Rented'
    // Bạn có thể đổi điều kiện này dựa theo schema thực tế của bảng Contract/Room
    const activeRooms = await Room.find({ status: "Occupied" }); 
    
    const invoicesToCreate = activeRooms.map(room => ({
      invoiceCode: `INV-${room.name}-${month}${year}-${Date.now().toString().slice(-4)}`,
      roomId: room._id,
      title: `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`,
      type: "Periodic",
      totalAmount: room.price || 0, // Tiền phòng mặc định (chưa cộng điện nước)
      dueDate: dueDate,
      status: "Draft" // Đặt trạng thái Nháp
    }));

    if (invoicesToCreate.length === 0) throw new Error("Không có phòng nào đang thuê để tạo hóa đơn.");

    return await Invoice.insertMany(invoicesToCreate);
  }

  // 2. CHỨC NĂNG: PHÁT HÀNH HÓA ĐƠN (Draft -> Unpaid)
  async releaseInvoice(id) {
    const invoice = await Invoice.findById(id);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn");
    if (invoice.status !== "Draft") throw new Error("Chỉ có thể phát hành hóa đơn ở trạng thái Nháp (Draft)");

    invoice.status = "Unpaid";
    return await invoice.save();
  }
}

module.exports = new InvoiceService();