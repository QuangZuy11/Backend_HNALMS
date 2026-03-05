const invoiceService = require("../services/invoice.service");

class InvoiceController {
  async getAll(req, res) {
    try {
      const invoices = await invoiceService.getInvoices(req.query);
      res.status(200).json({ success: true, data: invoices });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
  }

  // Tạo hóa đơn nháp
  async generateDrafts(req, res) {
    try {
      const result = await invoiceService.generateDraftInvoices(req.body);
      res.status(201).json({ success: true, message: `Tạo thành công ${result.length} hóa đơn nháp` });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
  }

  // Phát hành
  async release(req, res) {
    try {
      const invoice = await invoiceService.releaseInvoice(req.params.id);
      res.status(200).json({ success: true, data: invoice, message: "Phát hành thành công!" });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
  }

  // [THÊM MỚI] Xử lý request xem chi tiết hóa đơn
  async getInvoiceById(req, res) {
    try {
      const invoice = await invoiceService.getInvoiceById(req.params.id);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  // Lấy hóa đơn theo TenantId (có phân trang)
  async getInvoicesByTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const result = await invoiceService.getInvoicesByTenantId(tenantId, page, limit);
      res.status(200).json({
        success: true,
        data: result.invoices,
        pagination: result.pagination,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Tenant xem chi tiết 1 hóa đơn của chính mình
  async getMyInvoiceById(req, res) {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Unauthorized - Vui lòng đăng nhập" });
      }

      const invoice = await invoiceService.getMyInvoiceById(tenantId, req.params.id);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      const statusCode = error.message.includes("quyền") ? 403 : error.message.includes("Không tìm thấy") ? 404 : 500;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }

  // Xem chi tiết hóa đơn phát sinh (type = "Incurred")
  async getIncurredInvoiceDetail(req, res) {
    try {
      const invoice = await invoiceService.getIncurredInvoiceDetail(req.params.id);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      const statusCode = error.message.includes("Không tìm thấy") ? 404 : 400;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }

  // Thanh toán hóa đơn phát sinh (type = "Incurred")
  async payIncurredInvoice(req, res) {
    try {
      const result = await invoiceService.payIncurredInvoice(req.params.id);
      res.status(200).json({
        success: true,
        message: "Thanh toán hóa đơn phát sinh thành công.",
        data: result,
      });
    } catch (error) {
      const statusCode = error.message.includes("Không tìm thấy") ? 404 : 400;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }

  async markAsPaid(req, res) {
    try {
      const { id } = req.params;

      const updatedInvoice = await invoiceService.markAsPaid(id);

      return res.status(200).json({
        success: true,
        message: "Xác nhận thanh toán hóa đơn thành công!",
        data: updatedInvoice
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "Lỗi khi xác nhận thanh toán."
      });
    }
  }
}
module.exports = new InvoiceController();