const InvoicePeriodic = require("../../invoice-management/models/invoice_periodic.model");
const InvoiceIncurred = require("../../invoice-management/models/invoice_incurred.model");
const FinancialTicket = require("../../managing-income-expenses/models/financial_tickets");

class FinanceService {
  async getDashboardData(month, year) {
    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    const targetYear = parseInt(year) || new Date().getFullYear();

    const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
    const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // ==========================================
    // 1. QUERY DỮ LIỆU TRONG THÁNG ĐƯỢC CHỌN
    // ==========================================
    const periodicInvoices = await InvoicePeriodic.find({ 
        createdAt: { $gte: startOfMonth, $lte: endOfMonth } 
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    const incurredInvoices = await InvoiceIncurred.find({ 
        createdAt: { $gte: startOfMonth, $lte: endOfMonth } 
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    // Lấy phiếu chi (expense) có trạng thái hoàn thành/đã chi
    const financialTickets = await FinancialTicket.find({ 
        transactionDate: { $gte: startOfMonth, $lte: endOfMonth },
        status: { $in: ["Completed", "Paid", "Approved"] } // Tùy chỉnh theo trạng thái thực tế của bạn
    });

    // ==========================================
    // 2. TÍNH TOÁN 4 THẺ TỔNG QUAN (SUMMARY CARDS)
    // ==========================================
    let totalRevenuePeriodic = 0;
    let totalRevenueIncurred = 0;
    let totalDebtPeriodic = 0;
    let totalDebtIncurred = 0;

    // [MỚI] Khai báo thêm 2 biến để bóc tách hóa đơn phát sinh
    let prepaidRentRev = 0;     // Tiền phòng trả trước
    let actualIncurredRev = 0;  // Tiền phạt, sửa chữa thực tế

    periodicInvoices.forEach(inv => {
      if (inv.status === "Paid") totalRevenuePeriodic += inv.totalAmount;
      if (inv.status === "Unpaid") totalDebtPeriodic += inv.totalAmount;
    });

    incurredInvoices.forEach(inv => {
      if (inv.status === "Paid") {
          totalRevenueIncurred += inv.totalAmount; // Vẫn cộng vào tổng thu
          
          // [MỚI] Bóc tách dữ liệu cho Biểu đồ tròn
          if (inv.type === "prepaid") {
              prepaidRentRev += inv.totalAmount;
          } else {
              // Các type còn lại (violation, repair) sẽ vào đây
              actualIncurredRev += inv.totalAmount;
          }
      }
      if (inv.status === "Unpaid") totalDebtIncurred += inv.totalAmount;
    });

    const totalRevenue = totalRevenuePeriodic + totalRevenueIncurred;
    const totalDebt = totalDebtPeriodic + totalDebtIncurred;
    const totalExpense = financialTickets.reduce((sum, ticket) => sum + ticket.amount, 0);
    const netProfit = totalRevenue - totalExpense;

    // ==========================================
    // 3. TÍNH CƠ CẤU DOANH THU (PIE CHART)
    // ==========================================
    let rentRev = 0, elecRev = 0, waterRev = 0, serviceRev = 0;
    periodicInvoices.forEach(inv => {
      if (inv.status === "Paid") {
        inv.items.forEach(item => {
          const name = item.itemName.toLowerCase();
          if (name.includes("phòng")) rentRev += item.amount;
          else if (name.includes("điện")) elecRev += item.amount;
          else if (name.includes("nước")) waterRev += item.amount;
          else serviceRev += item.amount;
        });
      }
    });

    // [ĐÃ SỬA] Cập nhật mảng trả về cho Frontend
    const revenueBreakdown = [
      { name: "Tiền phòng (Định kỳ)", value: rentRev },
      { name: "Tiền phòng trả trước", value: prepaidRentRev }, // [MỚI] Tách riêng
      { name: "Tiền điện", value: elecRev },
      { name: "Tiền nước", value: waterRev },
      { name: "Dịch vụ khác", value: serviceRev },
      { name: "Phạt & Sửa chữa", value: actualIncurredRev } // [ĐÃ ĐỔI TÊN] Chỉ còn tiền phạt/sửa chữa
    ].filter(item => item.value > 0); // Chỉ lấy những mục có tiền

    // ==========================================
    // 4. LẤY BIỂU ĐỒ 6 THÁNG GẦN NHẤT (BAR CHART)
    // ==========================================
    const chartData = [];
    for (let i = 5; i >= 0; i--) {
      let m = targetMonth - i;
      let y = targetYear;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      
      const sDate = new Date(y, m - 1, 1);
      const eDate = new Date(y, m, 0, 23, 59, 59);

      const pInv = await InvoicePeriodic.find({ createdAt: { $gte: sDate, $lte: eDate }, status: "Paid" });
      const iInv = await InvoiceIncurred.find({ createdAt: { $gte: sDate, $lte: eDate }, status: "Paid" });
      const tix = await FinancialTicket.find({ transactionDate: { $gte: sDate, $lte: eDate }, status: { $in: ["Completed", "Paid", "Approved"] } });

      const rev = pInv.reduce((s, x) => s + x.totalAmount, 0) + iInv.reduce((s, x) => s + x.totalAmount, 0);
      const exp = tix.reduce((s, x) => s + x.amount, 0);

      chartData.push({
        month: `T${m}/${y.toString().slice(-2)}`, // Format: T3/26
        revenue: rev,
        expense: exp
      });
    }

    // ==========================================
    // 5. DANH SÁCH TOP 5 CÔNG NỢ CAO NHẤT (TABLE)
    // ==========================================
    const getRoomName = (inv) => {
        if (inv.contractId && inv.contractId.roomId) return inv.contractId.roomId.name;
        return "Không xác định";
    };

    const topDebts = [...periodicInvoices, ...incurredInvoices]
      .filter(inv => inv.status === "Unpaid")
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5) // Chỉ lấy top 5
      .map(inv => ({
        code: inv.invoiceCode,
        room: getRoomName(inv),
        title: inv.title,
        amount: inv.totalAmount,
        dueDate: inv.dueDate,
        type: inv.items ? 'Định kỳ' : 'Phát sinh'
      }));

    return {
      summary: { totalRevenue, totalExpense, netProfit, totalDebt },
      revenueBreakdown,
      chartData,
      topDebts
    };
  }

  async getCashflowReport(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // 1. Lấy tất cả Hóa đơn Định kỳ (Phòng, Điện, Nước, Dịch vụ)
    const periodicInvoices = await InvoicePeriodic.find({
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Draft" } // Bỏ qua bản nháp, kế toán chỉ quan tâm cái đã chốt
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    // 2. Lấy Hóa đơn Phát sinh (Phạt, Sửa chữa, Trả trước)
    const incurredInvoices = await InvoiceIncurred.find({
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Draft" }
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    // 3. Lấy Phiếu Chi
    const financialTickets = await FinancialTicket.find({
      transactionDate: { $gte: start, $lte: end },
      status: { $in: ["Completed", "Paid", "Approved"] }
    });

    // 4. XỬ LÝ DỮ LIỆU ĐỂ ĐỔ RA BẢNG (FLATTEN DATA)
    let ledger = [];
    let summary = {
      expectedRevenue: 0,
      actualCollected: 0,
      actualExpense: 0,
      totalDebt: 0
    };

    const getRoomName = (inv) => {
        if (inv.contractId && inv.contractId.roomId) return inv.contractId.roomId.name;
        return "N/A";
    };

    // --- Bóc tách Định kỳ ---
    periodicInvoices.forEach(inv => {
      summary.expectedRevenue += inv.totalAmount;
      if (inv.status === "Paid") summary.actualCollected += inv.totalAmount;
      if (inv.status === "Unpaid") summary.totalDebt += inv.totalAmount;

      ledger.push({
        id: inv._id,
        code: inv.invoiceCode,
        date: inv.createdAt,
        room: getRoomName(inv),
        transactionType: inv.status === "Paid" ? "THU" : "NỢ",
        category: "Định kỳ (Phòng, Điện, Nước...)",
        // [MỚI] Thêm Hình thức thanh toán và Ghi chú
        paymentMethod: inv.paymentMethod || (inv.status === "Paid" ? "Chuyển khoản" : "-"),
        description: inv.title || "Thu tiền định kỳ", 
        inflow: inv.totalAmount,
        outflow: 0,
        status: inv.status
      });
    });

    // --- Bóc tách Phát sinh ---
    incurredInvoices.forEach(inv => {
      summary.expectedRevenue += inv.totalAmount;
      if (inv.status === "Paid") summary.actualCollected += inv.totalAmount;
      if (inv.status === "Unpaid") summary.totalDebt += inv.totalAmount;

      let catName = inv.type === "prepaid" ? "Tiền phòng trả trước" : "Thu phát sinh (Phạt/Sửa chữa)";

      ledger.push({
        id: inv._id,
        code: inv.invoiceCode,
        date: inv.createdAt,
        room: getRoomName(inv),
        transactionType: inv.status === "Paid" ? "THU" : "NỢ",
        category: catName,
        // [MỚI] Thêm Hình thức thanh toán và Ghi chú
        paymentMethod: inv.paymentMethod || (inv.status === "Paid" ? "Chuyển khoản" : "-"),
        description: inv.title || "Thu tiền phát sinh",
        inflow: inv.totalAmount,
        outflow: 0,
        status: inv.status
      });
    });

    // --- Bóc tách Phiếu Chi ---
    financialTickets.forEach(ticket => {
      summary.actualExpense += ticket.amount;

      ledger.push({
        id: ticket._id,
        code: "TC-" + ticket._id.toString().slice(-5).toUpperCase(),
        date: ticket.transactionDate,
        room: "Tòa nhà (Chung)",
        transactionType: "CHI",
        category: "Chi phí vận hành", // Cố định loại category cho phiếu chi
        // [MỚI] Thêm Hình thức thanh toán và Ghi chú (Lấy title của ticket làm diễn giải)
        paymentMethod: ticket.paymentMethod || "-",
        description: ticket.title + (ticket.rejectionReason ? ` (Lý do: ${ticket.rejectionReason})` : ""),
        inflow: 0,
        outflow: ticket.amount,
        status: ticket.status
      });
    });

    // Sắp xếp chứng từ theo thời gian mới nhất lên đầu
    ledger.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Tính thêm chỉ số phụ
    summary.netCashFlow = summary.actualCollected - summary.actualExpense;
    summary.collectionRate = summary.expectedRevenue > 0 
      ? ((summary.actualCollected / summary.expectedRevenue) * 100).toFixed(2) 
      : 0;

    return {
      summary,
      ledger
    };
  }
  // LẤY BÁO CÁO KẾT QUẢ KINH DOANH (P&L / REVENUE REPORT)
  async getRevenueReport(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // 1. Lấy Hóa đơn Định kỳ (Bao gồm cả Paid và Unpaid, miễn không phải Draft)
    const periodicInvoices = await InvoicePeriodic.find({
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Draft" }
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    // 2. Lấy Hóa đơn Phát sinh (LOẠI BỎ PREPAID vì trả trước không tính là doanh thu kỳ này)
    const incurredInvoices = await InvoiceIncurred.find({
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Draft" },
      type: { $ne: "prepaid" } // Quan trọng: Bỏ qua tiền trả trước
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    // 3. Lấy Phiếu Chi (Chi phí ghi nhận trong kỳ)
    const financialTickets = await FinancialTicket.find({
      transactionDate: { $gte: start, $lte: end },
      status: { $in: ["Completed", "Paid", "Approved"] }
    });

    let pnlLedger = [];
    let summary = {
      recognizedRevenue: 0, // Doanh thu ghi nhận
      recognizedExpense: 0, // Chi phí ghi nhận
      netProfit: 0,         // Lợi nhuận gộp
      profitMargin: 0       // Tỷ suất lợi nhuận (%)
    };

    const getRoomName = (inv) => {
        if (inv.contractId && inv.contractId.roomId) return inv.contractId.roomId.name;
        return "N/A";
    };

    // --- Ghi nhận Doanh thu Định kỳ ---
    periodicInvoices.forEach(inv => {
      summary.recognizedRevenue += inv.totalAmount;
      pnlLedger.push({
        id: inv._id,
        date: inv.createdAt,
        code: inv.invoiceCode,
        room: getRoomName(inv),
        description: inv.title,
        category: "Doanh thu Định kỳ",
        revenue: inv.totalAmount,
        expense: 0,
        status: inv.status === "Paid" ? "Đã thu tiền" : "Đang nợ"
      });
    });

    // --- Ghi nhận Doanh thu Phát sinh (Chỉ tính Phạt/Sửa chữa) ---
    incurredInvoices.forEach(inv => {
      summary.recognizedRevenue += inv.totalAmount;
      pnlLedger.push({
        id: inv._id,
        date: inv.createdAt,
        code: inv.invoiceCode,
        room: getRoomName(inv),
        description: inv.title,
        category: "Doanh thu Phạt/Sửa chữa",
        revenue: inv.totalAmount,
        expense: 0,
        status: inv.status === "Paid" ? "Đã thu tiền" : "Đang nợ"
      });
    });

    // --- Ghi nhận Chi phí ---
    financialTickets.forEach(ticket => {
      summary.recognizedExpense += ticket.amount;
      pnlLedger.push({
        id: ticket._id,
        date: ticket.transactionDate,
        code: "TC-" + ticket._id.toString().slice(-5).toUpperCase(),
        room: "Tòa nhà (Chung)",
        description: ticket.title,
        category: "Chi phí Vận hành",
        revenue: 0,
        expense: ticket.amount,
        status: "Đã chi"
      });
    });

    pnlLedger.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Tính lợi nhuận
    summary.netProfit = summary.recognizedRevenue - summary.recognizedExpense;
    summary.profitMargin = summary.recognizedRevenue > 0 
      ? ((summary.netProfit / summary.recognizedRevenue) * 100).toFixed(2) 
      : 0;

    return { summary, ledger: pnlLedger };
  }
}

module.exports = new FinanceService();