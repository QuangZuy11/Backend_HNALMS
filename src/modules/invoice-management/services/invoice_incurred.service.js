const InvoiceIncurred = require("../models/invoice_incurred.model");
const Contract = require("../../contract-management/models/contract.model");
const RepairRequest = require("../../request-management/models/repair_requests.model");

// Ghi chú: Nếu bạn có model ReceiptTicket ở module kế toán thì require vào đây
// const ReceiptTicket = require("../../accounting/models/receipt_ticket.model"); 

class InvoiceIncurredService {
  
  // 1. LẤY DANH SÁCH HÓA ĐƠN PHÁT SINH
  async getInvoices(query = {}) {
    return await InvoiceIncurred.find(query)
      .populate({
        path: "contractId",
        select: "contractCode roomId tenantId",
        populate: { path: "roomId", select: "name floorId" }
      })
      .populate({
        path: "repairRequestId",
        select: "description status devicesId",
        populate: { path: "devicesId", select: "name" }
      })
      .sort({ createdAt: -1 });
  }

  // 2. TẠO HÓA ĐƠN PHÁT SINH MỚI
  // Thường được gọi ngầm khi Quản lý duyệt 1 Yêu cầu sửa chữa và có báo giá
  async createIncurredInvoice(data) {
    // Tự động sinh mã hóa đơn nếu chưa truyền vào
    if (!data.invoiceCode) {
      const date = new Date();
      const monthYear = `${date.getMonth() + 1}${date.getFullYear()}`;
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      data.invoiceCode = `INV-INC-${monthYear}-${randomSuffix}`;
    }

    const newInvoice = new InvoiceIncurred(data);
    return await newInvoice.save();
  }

  // 3. PHÁT HÀNH HÓA ĐƠN
  async releaseInvoice(id) {
    const invoice = await InvoiceIncurred.findById(id);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn phát sinh");
    if (invoice.status !== "Draft") throw new Error("Chỉ có thể phát hành hóa đơn ở trạng thái Nháp (Draft)");

    invoice.status = "Unpaid";
    return await invoice.save();
  }

  // 4. LẤY CHI TIẾT 1 HÓA ĐƠN PHÁT SINH (Dành cho Kế toán / Quản lý)
  async getInvoiceById(id) {
    const invoice = await InvoiceIncurred.findById(id)
      .populate({
        path: "contractId",
        select: "contractCode startDate endDate tenantId roomId",
        populate: [
          { path: "roomId", select: "name roomCode floorId" },
          { path: "tenantId", select: "username email phoneNumber" }
        ]
      })
      .populate({
        path: "repairRequestId",
        select: "description devicesId status",
        populate: { path: "devicesId", select: "name" } // Trích xuất tên thiết bị bị hỏng
      })
      // .populate("receiptTicketId") // Nếu bạn muốn lấy thông tin Phiếu Thu
      .lean();

    if (!invoice) throw new Error("Không tìm thấy hóa đơn phát sinh này.");

    // Flatten data ra ngoài để Frontend cũ vẫn hiển thị bình thường mà không cần sửa code
    return {
      ...invoice,
      roomId: invoice.contractId?.roomId || null, 
      tenant: invoice.contractId?.tenantId || null,
      contractCode: invoice.contractId?.contractCode || null,
      deviceName: invoice.repairRequestId?.devicesId?.name || null,
      repairDescription: invoice.repairRequestId?.description || null,
    };
  }

  // 5. XÁC NHẬN THANH TOÁN (Logic móc nối 2 Module)
  async payIncurredInvoice(invoiceId, receiptTicketId = null) {
    const invoice = await InvoiceIncurred.findById(invoiceId);
    
    if (!invoice) throw new Error("Không tìm thấy hóa đơn phát sinh.");
    if (invoice.status !== "Unpaid") {
      throw new Error(`Hóa đơn này không ở trạng thái chờ thanh toán (trạng thái hiện tại: ${invoice.status}).`);
    }

    // A. Cập nhật Hóa đơn -> Đã thu
    invoice.status = "Paid";
    if (receiptTicketId) {
      invoice.receiptTicketId = receiptTicketId; // Lưu ID Phiếu thu để đối soát
    }
    await invoice.save();

    // B. Cập nhật Yêu cầu sửa chữa tương ứng -> "Paid" (Đã thanh toán xong)
    if (invoice.repairRequestId) {
      await RepairRequest.findByIdAndUpdate(invoice.repairRequestId, { status: "Paid" });
    }

    return invoice;
  }

  // 6. LẤY DANH SÁCH HÓA ĐƠN THEO TENANT (Dành cho App Khách Thuê)
  async getInvoicesByTenantId(tenantId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    // Tìm tất cả hợp đồng của khách thuê
    const contracts = await Contract.find({ tenantId }).select("_id");
    if (contracts.length === 0) {
      return { invoices: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    const contractIds = contracts.map(c => c._id);

    const query = {
      contractId: { $in: contractIds },
      status: { $ne: "Draft" } // Khách thuê không được thấy bản nháp
    };

    const total = await InvoiceIncurred.countDocuments(query);
    const invoices = await InvoiceIncurred.find(query)
      .populate({
        path: "contractId",
        select: "roomId contractCode",
        populate: { path: "roomId", select: "name" }
      })
      .populate("repairRequestId", "description")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Flatten roomId ra ngoài cho App Frontend dễ render
    const formattedInvoices = invoices.map(inv => ({
      ...inv,
      roomId: inv.contractId?.roomId || null,
      contractCode: inv.contractId?.contractCode || null,
      repairDescription: inv.repairRequestId?.description || null
    }));

    return {
      invoices: formattedInvoices,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // 7. KHÁCH THUÊ XEM CHI TIẾT
  async getMyInvoiceById(tenantId, invoiceId) {
    const contracts = await Contract.find({ tenantId }).select("_id");
    if (contracts.length === 0) throw new Error("Bạn không có hợp đồng thuê nào.");
    
    const contractIds = contracts.map(c => c._id.toString());
    const invoice = await this.getInvoiceById(invoiceId);

    // Bảo mật: Kiểm tra xem hóa đơn có thuộc Hợp đồng của User này không
    if (!invoice.contractId || !contractIds.includes(invoice.contractId._id.toString())) {
      throw new Error("Bạn không có quyền xem hóa đơn này.");
    }

    return invoice;
  }
}

module.exports = new InvoiceIncurredService();