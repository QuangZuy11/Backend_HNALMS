const invoiceIncurredService = require("../services/invoice_incurred.service");

class InvoiceIncurredController {
  async getAll(req, res) {
    try {
      const { status, page, limit, type, from, to } = req.query;
      const result = await invoiceIncurredService.getInvoices({
        status,
        page,
        limit,
        type,
        from,
        to,
      });

      res.status(200).json({
        success: true,
        data: result.invoices,
        pagination: result.pagination,
      });
    } catch (error) { 
      res.status(500).json({ success: false, message: error.message }); 
    }
  }

  async create(req, res) {
    try {
      const invoice = await invoiceIncurredService.createIncurredInvoice(req.body);
      res.status(201).json({ success: true, data: invoice });
    } catch (error) { 
      res.status(400).json({ success: false, message: error.message }); 
    }
  }

  async release(req, res) {
    try {
      const invoice = await invoiceIncurredService.releaseInvoice(req.params.id);
      res.status(200).json({ success: true, data: invoice, message: "Phát hành hóa đơn thành công!" });
    } catch (error) { 
      res.status(400).json({ success: false, message: error.message }); 
    }
  }

  async getInvoiceById(req, res) {
    try {
      const invoice = await invoiceIncurredService.getInvoiceById(req.params.id);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getInvoicesByTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;

      const result = await invoiceIncurredService.getInvoicesByTenantId(
        tenantId,
        page,
        limit,
      );
      res.status(200).json({
        success: true,
        data: result.invoices,
        pagination: result.pagination,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getMyInvoiceById(req, res) {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - Vui lòng đăng nhập",
        });
      }

      const invoice = await invoiceIncurredService.getMyInvoiceById(
        tenantId,
        req.params.id,
      );
      res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      const statusCode = error.message.includes("quyền")
        ? 403
        : error.message.includes("Không tìm thấy")
          ? 404
          : 500;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }

  async getNextCode(_req, res) {
    try {
      const code = await invoiceIncurredService.getNextViolationCode();
      res.status(200).json({ success: true, data: { invoiceCode: code } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async payInvoice(req, res) {
    try {
      const result = await invoiceIncurredService.payIncurredInvoice(req.params.id);
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
}

module.exports = new InvoiceIncurredController();
