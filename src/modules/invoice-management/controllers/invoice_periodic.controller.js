const invoicePeriodicService = require("../services/invoice_periodic.service");

class InvoicePeriodicController {
  async getAll(req, res) {
    try {
      const invoices = await invoicePeriodicService.getInvoices(req.query);
      res.status(200).json({ success: true, data: invoices });
    } catch (error) { 
      res.status(500).json({ success: false, message: error.message }); 
    }
  }

  // Tạo hóa đơn nháp định kỳ
  async generateDrafts(req, res) {
    try {
      const result = await invoicePeriodicService.generateDraftInvoices();
      res.status(201).json({ success: true, message: `Tạo thành công ${result.length} hóa đơn nháp định kỳ` });
    } catch (error) { 
      res.status(400).json({ success: false, message: error.message }); 
    }
  }

  // Phát hành hóa đơn định kỳ
  async release(req, res) {
    try {
      const invoice = await invoicePeriodicService.releaseInvoice(req.params.id);
      res.status(200).json({ success: true, data: invoice, message: "Phát hành hóa đơn thành công!" });
    } catch (error) { 
      res.status(400).json({ success: false, message: error.message }); 
    }
  }

  // Xem chi tiết 1 hóa đơn định kỳ
  async getInvoiceById(req, res) {
    try {
      const invoice = await invoicePeriodicService.getInvoiceById(req.params.id);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  // Lấy hóa đơn định kỳ theo TenantId (cho Quản lý)
  async getInvoicesByTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const result = await invoicePeriodicService.getInvoicesByTenantId(tenantId, page, limit);
      res.status(200).json({
        success: true,
        data: result.invoices,
        pagination: result.pagination,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Tenant xem chi tiết hóa đơn của chính mình trên App
  async getMyInvoiceById(req, res) {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Unauthorized - Vui lòng đăng nhập" });
      }

      const invoice = await invoicePeriodicService.getMyInvoiceById(tenantId, req.params.id);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      const statusCode = error.message.includes("quyền") ? 403 : error.message.includes("Không tìm thấy") ? 404 : 500;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }

  // Xác nhận thanh toán hóa đơn định kỳ
  async markAsPaid(req, res) {
    try {
      const { id } = req.params;
      const updatedInvoice = await invoicePeriodicService.markAsPaid(id);

      return res.status(200).json({
        success: true,
        message: "Xác nhận thanh toán hóa đơn định kỳ thành công!",
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

module.exports = new InvoicePeriodicController();