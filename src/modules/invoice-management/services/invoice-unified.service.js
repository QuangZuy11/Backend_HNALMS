const Contract = require("../../contract-management/models/contract.model");
const InvoicePeriodic = require("../models/invoice_periodic.model");
const InvoiceIncurred = require("../models/invoice_incurred.model");

class InvoiceUnifiedService {
  /**
   * Lấy danh sách hóa đơn của tenant (cả Periodic và Incurred)
   * @param {string} tenantId - ID của tenant
   * @param {number} page - Số trang
   * @param {number} limit - Số lượng mỗi trang
   * @param {string} type - Lọc theo loại: 'periodic' | 'incurred' | 'all' (mặc định: 'all')
   * @param {string} status - Lọc theo status: 'Unpaid' | 'Paid' | 'all' (mặc định: 'all')
   */
  async getInvoicesByTenantId(tenantId, page = 1, limit = 10, type = 'all', status = 'all') {
    // Tìm tất cả hợp đồng của tenant
    const contracts = await Contract.find({ tenantId }).select("_id");
    if (contracts.length === 0) {
      return {
        invoices: [],
        pagination: { total: 0, page, limit, totalPages: 0 }
      };
    }

    const contractIds = contracts.map(c => c._id);

    // Lấy hóa đơn từ 2 nguồn song song
    const results = await Promise.all([
      this.getPeriodicInvoices(contractIds, type, status, 0, 1000), // Lấy nhiều để sort
      this.getIncurredInvoices(contractIds, type, status, 0, 1000)  // Lấy nhiều để sort
    ]);

    let periodicInvoices = results[0].invoices;
    let incurredInvoices = results[1].invoices;
    const totalPeriodic = results[0].total;
    const totalIncurred = results[1].total;

    // Gộp và sắp xếp theo ngày tạo (mới nhất trước)
    let allInvoices = [];
    if (type === 'all' || type === 'periodic') {
      allInvoices = [...allInvoices, ...periodicInvoices];
    }
    if (type === 'all' || type === 'incurred') {
      allInvoices = [...allInvoices, ...incurredInvoices];
    }

    // Sắp xếp
    allInvoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Tính tổng
    const total = type === 'all' ? (totalPeriodic + totalIncurred) :
                  type === 'periodic' ? totalPeriodic : totalIncurred;

    // Phân trang sau khi gộp
    const skip = (page - 1) * limit;
    const paginatedInvoices = allInvoices.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit);

    return {
      invoices: paginatedInvoices,
      pagination: { total, page, limit, totalPages }
    };
  }

  async getPeriodicInvoices(contractIds, type, status, skip, limit) {
    if (type === 'incurred') {
      return { invoices: [], total: 0 };
    }

    const query = {
      contractId: { $in: contractIds },
      status: { $ne: "Draft" }
    };

    // Filter status
    if (status && status !== 'all') {
      query.status = status;
    }

    const total = await InvoicePeriodic.countDocuments(query);
    const invoices = await InvoicePeriodic.find(query)
      .populate({
        path: "contractId",
        select: "roomId contractCode",
        populate: { path: "roomId", select: "name floorId" }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedInvoices = invoices.map(inv => ({
        ...inv,
        roomId: inv.contractId?.roomId || null,
        contractCode: inv.contractId?.contractCode || null,
        invoiceType: "Periodic"
      }));

    return { invoices: formattedInvoices, total };
  }

  async getIncurredInvoices(contractIds, type, status, skip, limit) {
    if (type === 'periodic') {
      return { invoices: [], total: 0 };
    }

    const query = {
      contractId: { $in: contractIds },
      status: { $ne: "Draft" }
    };

    // Filter status
    if (status && status !== 'all') {
      query.status = status;
    }

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

    const formattedInvoices = invoices.map(inv => ({
        ...inv,
        roomId: inv.contractId?.roomId || null,
        contractCode: inv.contractId?.contractCode || null,
        repairDescription: inv.repairRequestId?.description || null,
        invoiceType: "Incurred"
      }));

    return { invoices: formattedInvoices, total };
  }
}

module.exports = new InvoiceUnifiedService();
