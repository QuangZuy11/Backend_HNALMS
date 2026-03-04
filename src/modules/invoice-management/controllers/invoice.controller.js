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
}
module.exports = new InvoiceController();