const invoiceIncurredService = require("../services/invoice_incurred.service");

class InvoiceIncurredController {
  async getAll(req, res) {
    try {
      const { status, page, limit, type } = req.query;
      const result = await invoiceIncurredService.getInvoices({ status, page, limit, type });
      res.status(200).json({
        success: true,
        data: result.invoices,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
      });
    } catch (error) { 
      res.status(500).json({ success: false, message: error.message }); 
    }
  }

  // Quản lý tạo hóa đơn phát sinh thủ công (ví dụ: bồi thường đồ đạc)
  async create(req, res) {
    try {
      const invoice = await invoiceIncurredService.createIncurredInvoice(req.body);
      res.status(201).json({ success: true, message: "Tạo hóa đơn phát sinh thành công", data: invoice });
    } catch (error) { 
      res.status(400).json({ success: false, message: error.message }); 
    }
  }

  // Phát hành hóa đơn phát sinh
  async release(req, res) {
    try {
      const invoice = await invoiceIncurredService.releaseInvoice(req.params.id);
      res.status(200).json({ success: true, data: invoice, message: "Phát hành thành công!" });
    } catch (error) { 
      res.status(400).json({ success: false, message: error.message }); 
    }
  }

  // Lấy mã vi phạm tiếp theo
  async getNextCode(req, res) {
    try {
      const code = await invoiceIncurredService.getNextViolationCode();
      res.status(200).json({ success: true, data: code });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Lấy chi tiết hóa đơn phát sinh
  async getInvoiceById(req, res) {
    try {
      const invoice = await invoiceIncurredService.getInvoiceById(req.params.id);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  // Lấy danh sách hóa đơn phát sinh theo Khách thuê
  async getInvoicesByTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const result = await invoiceIncurredService.getInvoicesByTenantId(tenantId, page, limit);
      res.status(200).json({
        success: true,
        data: result.invoices,
        pagination: result.pagination,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Khách thuê xem chi tiết hóa đơn phát sinh
  async getMyInvoiceById(req, res) {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Unauthorized - Vui lòng đăng nhập" });
      }

      const invoice = await invoiceIncurredService.getMyInvoiceById(tenantId, req.params.id);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      const statusCode = error.message.includes("quyền") ? 403 : error.message.includes("Không tìm thấy") ? 404 : 500;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }

  // Xác nhận thanh toán hóa đơn phát sinh
  async payInvoice(req, res) {
    try {
      const { receiptTicketId } = req.body; // Có thể Kế toán sẽ truyền mã phiếu thu lên
      const result = await invoiceIncurredService.payIncurredInvoice(req.params.id, receiptTicketId);
      
      res.status(200).json({
        success: true,
        message: "Thanh toán hóa đơn phát sinh thành công. Hệ thống đã cập nhật Yêu cầu sửa chữa tương ứng.",
        data: result,
      });
    } catch (error) {
      const statusCode = error.message.includes("Không tìm thấy") ? 404 : 400;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }
}

module.exports = new InvoiceIncurredController();