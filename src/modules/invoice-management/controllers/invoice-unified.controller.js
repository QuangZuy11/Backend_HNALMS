const invoiceUnifiedService = require("../services/invoice-unified.service");

// Lấy danh sách hóa đơn của tenant (cả Periodic và Incurred)
exports.getInvoicesByTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { page = 1, limit = 10, type = 'all', status = 'all' } = req.query;

    const result = await invoiceUnifiedService.getInvoicesByTenantId(
      tenantId,
      parseInt(page),
      parseInt(limit),
      type,
      status
    );

    return res.status(200).json({
      success: true,
      data: result.invoices,
      pagination: result.pagination,
      filters: {
        type,
        status
      }
    });
  } catch (error) {
    console.error("Get Invoices By Tenant Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Lỗi server"
    });
  }
};
