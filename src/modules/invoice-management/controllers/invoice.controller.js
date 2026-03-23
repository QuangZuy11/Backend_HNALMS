const invoiceService = require("../services/invoice.service");
const notificationService = require("../../notification-management/services/notification.service");
const Contract = require("../../contract-management/models/contract.model");

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
      console.log(`[INVOICE CONTROLLER] 🔄 Bắt đầu tạo hóa đơn nháp...`);
      const result = await invoiceService.generateDraftInvoices(req.body);
      console.log(`[INVOICE CONTROLLER] ✅ Đã tạo ${result.length} hóa đơn nháp`);
      
      // ⚠️ KHÔNG gửi notification khi tạo draft
      // Notification sẽ được gửi khi admin phát hành hóa đơn (release)
      // để tránh gửi thông báo trùng lặp
      
      res.status(201).json({ success: true, message: `Tạo thành công ${result.length} hóa đơn nháp` });
    } catch (error) { 
      console.error(`[INVOICE CONTROLLER] ❌ Lỗi tạo hóa đơn:`, error.message);
      res.status(400).json({ success: false, message: error.message }); 
    }
  }

  // Phát hành
  async release(req, res) {
    try {
      console.log(`[INVOICE CONTROLLER] 🔄 Phát hành hóa đơn: ${req.params.id}`);
      const invoice = await invoiceService.releaseInvoice(req.params.id);
      console.log(`[INVOICE CONTROLLER] ✅ Phát hành thành công, invoiceCode: ${invoice.invoiceCode}`);
      
      // Gửi thông báo cho tenant khi hóa đơn định kỳ được phát hành
      if (invoice && invoice.contractId) {
        try {
          console.log(`[INVOICE CONTROLLER] 🎯 Tìm contract: ${invoice.contractId}`);
          const contract = await Contract.findById(invoice.contractId).select('tenantId');
          if (contract && contract.tenantId) {
            console.log(`[INVOICE CONTROLLER] 📬 Gửi notification đến tenant: ${contract.tenantId}`);
            const notifResult = await notificationService.createInvoiceNotification(
              contract.tenantId,
              'periodic',
              {
                invoiceCode: invoice.invoiceCode,
                title: invoice.title,
                totalAmount: invoice.totalAmount,
                dueDate: invoice.dueDate,
                items: invoice.items
              }
            );
            if (notifResult) {
              console.log(`[INVOICE CONTROLLER] ✅ Notification đã được lưu vào DB`);
            } else {
              console.warn(`[INVOICE CONTROLLER] ⚠️ Notification không được lưu (null result)`);
            }
          } else {
            console.warn(`[INVOICE CONTROLLER] ⚠️ Không tìm thấy contract hoặc tenantId`);
          }
        } catch (notifError) {
          console.error(`[INVOICE CONTROLLER] ❌ Lỗi gửi notification:`, notifError.message);
        }
      }
      
      res.status(200).json({ success: true, data: invoice, message: "Phát hành thành công!" });
    } catch (error) { 
      console.error(`[INVOICE CONTROLLER] ❌ Lỗi phát hành hóa đơn:`, error.message);
      res.status(400).json({ success: false, message: error.message }); 
    }
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