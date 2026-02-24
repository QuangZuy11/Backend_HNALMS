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
}
module.exports = new InvoiceController();