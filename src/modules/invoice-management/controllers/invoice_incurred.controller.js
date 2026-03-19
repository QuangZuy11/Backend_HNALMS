const invoiceIncurredService = require("../services/invoice_incurred.service");
const notificationService = require("../../notification-management/services/notification.service");
const Contract = require("../../contract-management/models/contract.model");

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
      console.log(`[INVOICE INCURRED CONTROLLER] 🔄 Bắt đầu tạo hóa đơn phát sinh...`);
      const invoice = await invoiceIncurredService.createIncurredInvoice(req.body);
      console.log(`[INVOICE INCURRED CONTROLLER] ✅ Đã tạo hóa đơn: ${invoice.invoiceCode}`);
      
      // Gửi thông báo cho tenant khi hóa đơn phát sinh được tạo
      if (invoice && invoice.contractId) {
        try {
          console.log(`[INVOICE INCURRED CONTROLLER] 🎯 Tìm contract: ${invoice.contractId}`);
          const contract = await Contract.findById(invoice.contractId).select('tenantId');
          if (contract && contract.tenantId) {
            console.log(`[INVOICE INCURRED CONTROLLER] 📬 Gửi notification đến tenant: ${contract.tenantId}`);
            const notifResult = await notificationService.createInvoiceNotification(
              contract.tenantId,
              'incurred',
              {
                invoiceCode: invoice.invoiceCode,
                title: invoice.title,
                totalAmount: invoice.totalAmount,
                dueDate: invoice.dueDate,
                type: invoice.type,
                description: `Hóa đơn ${invoice.type === 'repair' ? 'sửa chữa' : invoice.type === 'violation' ? 'vi phạm' : 'cọc'}`
              }
            );
            if (notifResult) {
              console.log(`[INVOICE INCURRED CONTROLLER] ✅ Notification đã được lưu vào DB`);
            } else {
              console.warn(`[INVOICE INCURRED CONTROLLER] ⚠️ Notification không được lưu (null result)`);
            }
          } else {
            console.warn(`[INVOICE INCURRED CONTROLLER] ⚠️ Không tìm thấy contract hoặc tenantId`);
          }
        } catch (notifError) {
          console.error(`[INVOICE INCURRED CONTROLLER] ❌ Lỗi gửi notification:`, notifError.message);
        }
      }
      
      res.status(201).json({ success: true, data: invoice });
    } catch (error) {
      console.error(`[INVOICE INCURRED CONTROLLER] ❌ Lỗi tạo hóa đơn:`, error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async release(req, res) {
    try {
      console.log(`[INVOICE INCURRED CONTROLLER] 🔄 Phát hành hóa đơn: ${req.params.id}`);
      const invoice = await invoiceIncurredService.releaseInvoice(req.params.id);
      console.log(`[INVOICE INCURRED CONTROLLER] ✅ Phát hành thành công, invoiceCode: ${invoice.invoiceCode}`);
      
      // Gửi thông báo cho tenant khi hóa đơn phát sinh được phát hành
      if (invoice && invoice.contractId) {
        try {
          console.log(`[INVOICE INCURRED CONTROLLER] 🎯 Tìm contract: ${invoice.contractId}`);
          const contract = await Contract.findById(invoice.contractId).select('tenantId');
          if (contract && contract.tenantId) {
            console.log(`[INVOICE INCURRED CONTROLLER] 📬 Gửi notification đến tenant: ${contract.tenantId}`);
            const notifResult = await notificationService.createInvoiceNotification(
              contract.tenantId,
              'incurred',
              {
                invoiceCode: invoice.invoiceCode,
                title: invoice.title,
                totalAmount: invoice.totalAmount,
                dueDate: invoice.dueDate,
                type: invoice.type,
                description: `Hóa đơn ${invoice.type === 'repair' ? 'sửa chữa' : invoice.type === 'violation' ? 'vi phạm' : 'cọc'}`
              }
            );
            if (notifResult) {
              console.log(`[INVOICE INCURRED CONTROLLER] ✅ Notification đã được lưu vào DB`);
            } else {
              console.warn(`[INVOICE INCURRED CONTROLLER] ⚠️ Notification không được lưu (null result)`);
            }
          } else {
            console.warn(`[INVOICE INCURRED CONTROLLER] ⚠️ Không tìm thấy contract hoặc tenantId`);
          }
        } catch (notifError) {
          console.error(`[INVOICE INCURRED CONTROLLER] ❌ Lỗi gửi notification:`, notifError.message);
        }
      }
      
      res.status(200).json({ success: true, data: invoice, message: "Phát hành hóa đơn thành công!" });
    } catch (error) {
      console.error(`[INVOICE INCURRED CONTROLLER] ❌ Lỗi phát hành hóa đơn:`, error.message);
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
