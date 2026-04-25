const InvoicePeriodic = require("../../invoice-management/models/invoice_periodic.model");
const InvoiceIncurred = require("../../invoice-management/models/invoice_incurred.model");
const FinancialTicket = require("../../managing-income-expenses/models/financial_tickets");
const Deposit = require("../../contract-management/models/deposit.model");

class FinanceService {
  // ==========================================
  // HELPER: PHÂN BỔ DOANH THU THEO THỜI GIAN (ACCRUAL BASIS)
  // ==========================================
  _parseRange(text) {
    if (!text) return null;
    const match = text.match(/từ (\d{2})\/(\d{2})\/(\d{4}) đến (\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const start = new Date(match[3], match[2] - 1, match[1]);
      const end = new Date(match[6], match[5] - 1, match[4], 23, 59, 59);
      return { start, end };
    }
    return null;
  }

  _getDistributedAmount(amount, text, reportStart, reportEnd, createdAt) {
    const range = this._parseRange(text);
    if (range) {
      const itemStart = range.start;
      const itemEnd = range.end;

      // Tổng số ngày của kỳ hạn này
      const totalDays = Math.max(1, Math.ceil((itemEnd - itemStart) / (1000 * 60 * 60 * 24)) + 1);

      // Số ngày giao thoa với kỳ báo cáo
      const overlapS = new Date(Math.max(itemStart, reportStart));
      const overlapE = new Date(Math.min(itemEnd, reportEnd));

      if (overlapS > overlapE) return 0;

      const overlapDays = Math.ceil((overlapE - overlapS) / (1000 * 60 * 60 * 24)) + 1;
      return (amount * overlapDays) / totalDays;
    }

    // Nếu không có dải ngày, kiểm tra xem có chuỗi "tháng MM/YYYY" không
    const monthMatch = text?.match(/tháng (\d{1,2})\/(\d{4})/i);
    if (monthMatch) {
      const m = parseInt(monthMatch[1]);
      const y = parseInt(monthMatch[2]);
      const targetMonthStart = new Date(y, m - 1, 1);
      // Nếu tháng của item khớp với tháng báo cáo (giả định reportStart là đầu tháng)
      if (targetMonthStart.getMonth() === reportStart.getMonth() && targetMonthStart.getFullYear() === reportStart.getFullYear()) {
        return amount;
      }
      return 0;
    }

    // Cuối cùng dùng ngày tạo nếu không có thông tin gì khác
    if (createdAt >= reportStart && createdAt <= reportEnd) return amount;
    return 0;
  }

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

    const financialTickets = await FinancialTicket.find({
      transactionDate: { $gte: startOfMonth, $lte: endOfMonth },
      status: { $in: ["Completed", "Paid", "Approved"] }
    });

    // [FIX LỖI LỆCH DÒNG TIỀN] Lấy cọc mới thu (Tiền VÀO) và cọc hoàn trả (Tiền RA)
    const incomingDeposits = await Deposit.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    });

    const refundedDeposits = await Deposit.find({
      status: "Refunded",
      refundDate: { $gte: startOfMonth, $lte: endOfMonth }
    });

    // [GIỮ NGUYÊN CHO BIỂU ĐỒ TRÒN] Query tiền cọc bỏ để tính Cơ Cấu Doanh Thu
    const forfeitedDeposits = await Deposit.find({
      status: { $in: ["Expired", "Forfeited"] },
      updatedAt: { $gte: startOfMonth, $lte: endOfMonth }
    });

    // ==========================================
    // 2. TÍNH TOÁN 4 THẺ TỔNG QUAN (SUMMARY CARDS - CASHFLOW LOGIC)
    // ==========================================
    let totalRevenuePeriodic = 0;
    let totalRevenueIncurred = 0;
    let totalDebtPeriodic = 0;
    let totalDebtIncurred = 0;

    let prepaidRentRev = 0;
    let violationRev = 0;
    let repairRev = 0;

    periodicInvoices.forEach(inv => {
      if (inv.status === "Paid") totalRevenuePeriodic += inv.totalAmount;
      if (inv.status === "Unpaid") totalDebtPeriodic += inv.totalAmount;
    });

    incurredInvoices.forEach(inv => {
      if (inv.status === "Paid") {
        totalRevenueIncurred += inv.totalAmount;

        if (inv.type === "violation") {
          violationRev += inv.totalAmount;
        } else if (inv.type === "repair") {
          repairRev += inv.totalAmount;
        }
      }
      if (inv.status === "Unpaid") totalDebtIncurred += inv.totalAmount;
    });

    // Prepaid rent từ InvoicePeriodic
    const prepaidFromPeriodic = periodicInvoices.filter(inv =>
      inv.status === "Paid" && inv.title && inv.title.toLowerCase().includes("trả trước")
    );
    prepaidFromPeriodic.forEach(inv => {
      prepaidRentRev += inv.totalAmount;
    });

    // Tính Cọc mới nhận (Dòng tiền vào)
    const collectedDepositFlow = incomingDeposits.reduce((sum, dep) => sum + dep.amount, 0);
    // Tính Cọc đã hoàn (Dòng tiền ra)
    const refundedDepositFlow = refundedDeposits.reduce((sum, dep) => sum + dep.amount, 0);

    // [ĐÃ ĐỒNG BỘ 100% VỚI BÁO CÁO DÒNG TIỀN]
    const totalRevenue = totalRevenuePeriodic + totalRevenueIncurred + collectedDepositFlow;
    const totalExpense = financialTickets.reduce((sum, ticket) => sum + ticket.amount, 0) + refundedDepositFlow;
    const netProfit = totalRevenue - totalExpense; // Đây thực chất là Tồn Quỹ (Net Cashflow)
    const totalDebt = totalDebtPeriodic + totalDebtIncurred;

    // ==========================================
    // 3. TÍNH CƠ CẤU DOANH THU (PIE CHART - P&L LOGIC)
    // ==========================================
    // [CẬP NHẬT LOGIC P&L] Truy vấn rộng hơn để bắt các khoản trả trước từ tháng trước hoặc cho tháng sau
    const allPeriodic = await InvoicePeriodic.find({ status: { $ne: "Draft" } });
    const allIncurred = await InvoiceIncurred.find({ status: { $ne: "Draft" } });

    let rentRev = 0, elecRev = 0, waterRev = 0, serviceRev = 0;
    let violationRevPnl = 0, repairRevPnl = 0, prepaidRentRevPnl = 0;

    allPeriodic.forEach(inv => {
      const created = new Date(inv.createdAt);
      inv.items.forEach(item => {
        const name = item.itemName.toLowerCase();
        const distAmt = this._getDistributedAmount(item.amount, item.itemName || inv.title, startOfMonth, endOfMonth, created);
        
        if (distAmt <= 0) return;

        if (name.includes("phòng")) {
          if (name.includes("trả trước")) prepaidRentRevPnl += distAmt;
          else rentRev += distAmt;
        } else if (name.includes("điện")) {
          elecRev += distAmt;
        } else if (name.includes("nước")) {
          waterRev += distAmt;
        } else {
          serviceRev += distAmt;
        }
      });
    });

    allIncurred.forEach(inv => {
      const created = new Date(inv.createdAt);
      const distAmt = this._getDistributedAmount(inv.totalAmount, inv.title, startOfMonth, endOfMonth, created);
      if (distAmt <= 0) return;

      if (inv.type === "violation") violationRevPnl += distAmt;
      else if (inv.type === "repair") repairRevPnl += distAmt;
      else if (inv.type === "prepaid") prepaidRentRevPnl += distAmt;
      else serviceRev += distAmt;
    });

    let guestDepositRev = 0;
    forfeitedDeposits.forEach(dep => { guestDepositRev += dep.amount; });

    const revenueBreakdown = [
      { name: "Tiền phòng (Định kỳ)", value: rentRev },
      { name: "Tiền phòng trả trước", value: prepaidRentRevPnl },
      { name: "Tiền điện", value: elecRev },
      { name: "Tiền nước", value: waterRev },
      { name: "Dịch vụ khác", value: serviceRev },
      { name: "Phạt vi phạm", value: violationRevPnl },
      { name: "Đền bù sửa chữa", value: repairRevPnl },
      { name: "Khách bỏ cọc giữ chỗ", value: guestDepositRev }
    ].filter(item => item.value > 0);

    // ==========================================
    // 4. LẤY BIỂU ĐỒ 6 THÁNG GẦN NHẤT (BAR CHART - ACCRUAL FOR REVENUE)
    // ==========================================
    const chartData = [];
    // Lấy dữ liệu chi và cọc cho 6 tháng
    const sixMonthsStart = new Date(targetYear, targetMonth - 6, 1);
    const tixForChart = await FinancialTicket.find({ 
      transactionDate: { $gte: sixMonthsStart, $lte: endOfMonth }, 
      status: { $in: ["Completed", "Paid", "Approved"] } 
    });
    const incDepsForChart = await Deposit.find({ createdAt: { $gte: sixMonthsStart, $lte: endOfMonth } });
    const refDepsForChart = await Deposit.find({ status: "Refunded", refundDate: { $gte: sixMonthsStart, $lte: endOfMonth } });

    for (let i = 5; i >= 0; i--) {
      let m = targetMonth - i;
      let y = targetYear;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }

      const sDate = new Date(y, m - 1, 1);
      const eDate = new Date(y, m, 0, 23, 59, 59);

      // Tính doanh thu phân bổ cho tháng này
      let rev = 0;
      allPeriodic.forEach(inv => {
        if (inv.status !== "Paid") return; // Chỉ tính hóa đơn đã thanh toán vào doanh thu thực tế biểu đồ
        const created = new Date(inv.createdAt);
        inv.items.forEach(item => {
          rev += this._getDistributedAmount(item.amount, item.itemName || inv.title, sDate, eDate, created);
        });
      });
      allIncurred.forEach(inv => {
        if (inv.status !== "Paid") return;
        rev += this._getDistributedAmount(inv.totalAmount, inv.title, sDate, eDate, new Date(inv.createdAt));
      });
      
      // Cộng cọc giữ chỗ (thu trong tháng này)
      rev += incDepsForChart.filter(d => d.createdAt >= sDate && d.createdAt <= eDate).reduce((s, x) => s + x.amount, 0);

      const exp = tixForChart.filter(t => t.transactionDate >= sDate && t.transactionDate <= eDate).reduce((s, x) => s + x.amount, 0) +
                  refDepsForChart.filter(d => d.refundDate >= sDate && d.refundDate <= eDate).reduce((s, x) => s + x.amount, 0);

      chartData.push({
        month: `T${m}/${y.toString().slice(-2)}`,
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
      .slice(0, 5)
      .map(inv => ({
        code: inv.invoiceCode,
        room: getRoomName(inv),
        title: inv.title,
        amount: inv.totalAmount,
        dueDate: inv.dueDate,
        type: inv.items ? 'Định kỳ' : 'Phát sinh'
      }));

    return {
      summary: { 
        totalInflow: totalRevenue, 
        totalOutflow: totalExpense, 
        netCashFlow: netProfit, 
        totalDebt 
      },
      revenueBreakdown,
      chartData,
      topDebts
    };
  }

  // ==========================================
  // BÁO CÁO DÒNG TIỀN (CASH FLOW)
  // ==========================================
  async getCashflowReport(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const periodicInvoices = await InvoicePeriodic.find({
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Draft" }
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    const incurredInvoices = await InvoiceIncurred.find({
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Draft" }
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    const financialTickets = await FinancialTicket.find({
      transactionDate: { $gte: start, $lte: end },
      status: { $in: ["Completed", "Paid", "Approved"] }
    });

    const incomingDeposits = await Deposit.find({
      createdAt: { $gte: start, $lte: end }
    }).populate('room');

    const refundedDeposits = await Deposit.find({
      status: "Refunded",
      refundDate: { $gte: start, $lte: end }
    }).populate('room');

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

    // --- Bóc tách Định kỳ & Trả trước ---
    periodicInvoices.forEach(inv => {
      const isPrepaid = inv.title && inv.title.toLowerCase().includes("trả trước");
      
      summary.expectedRevenue += inv.totalAmount;
      if (inv.status === "Paid") summary.actualCollected += inv.totalAmount;
      if (inv.status === "Unpaid") summary.totalDebt += inv.totalAmount;

      ledger.push({
        id: inv._id,
        code: inv.invoiceCode,
        date: inv.createdAt,
        room: getRoomName(inv),
        transactionType: inv.status === "Paid" ? "THU" : "NỢ",
        category: isPrepaid ? "Tiền phòng trả trước" : "Định kỳ (Phòng, Điện, Nước...)",
        paymentMethod: inv.paymentMethod || (inv.status === "Paid" ? "Chuyển khoản" : "-"),
        description: inv.title || (isPrepaid ? "Thu tiền phòng trả trước" : "Thu tiền định kỳ"),
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

      const catName = inv.type === "violation"
        ? "Thu phạt vi phạm"
        : inv.type === "repair"
          ? "Thu đền bù sửa chữa"
          : "Thu phát sinh khác";

      ledger.push({
        id: inv._id,
        code: inv.invoiceCode,
        date: inv.createdAt,
        room: getRoomName(inv),
        transactionType: inv.status === "Paid" ? "THU" : "NỢ",
        category: catName,
        paymentMethod: inv.paymentMethod || (inv.status === "Paid" ? "Chuyển khoản" : "-"),
        description: inv.title || "Thu tiền phát sinh",
        inflow: inv.totalAmount,
        outflow: 0,
        status: inv.status
      });
    });

    // (Hóa đơn trả trước đã được bóc tách ở vòng lặp định kỳ phía trên)

    // --- Bóc tách Phiếu Chi ---
    financialTickets.forEach(ticket => {
      summary.actualExpense += ticket.amount;

      ledger.push({
        id: ticket._id,
        code: "TC-" + ticket._id.toString().slice(-5).toUpperCase(),
        date: ticket.transactionDate,
        room: "Tòa nhà (Chung)",
        transactionType: "CHI",
        category: "Chi phí vận hành",
        paymentMethod: ticket.paymentMethod || "-",
        description: ticket.title + (ticket.rejectionReason ? ` (Lý do: ${ticket.rejectionReason})` : ""),
        inflow: 0,
        outflow: ticket.amount,
        status: ticket.status
      });
    });

    // --- Bóc tách Cọc giữ chỗ ---
    incomingDeposits.forEach(dep => {
      summary.actualCollected += dep.amount;

      ledger.push({
        id: dep._id,
        code: dep.transactionCode || "DEP-" + dep._id.toString().slice(-5).toUpperCase(),
        date: dep.createdAt,
        room: dep.room ? dep.room.name : "N/A",
        transactionType: "THU",
        category: "Thu cọc giữ chỗ (Khách ngoài)",
        paymentMethod: "Chuyển khoản",
        description: `Nhận cọc giữ chỗ của ${dep.name} - SĐT: ${dep.phone}`,
        inflow: dep.amount,
        outflow: 0,
        status: "Đã thu"
      });
    });

    // --- Bóc tách Hoàn Cọc ---
    refundedDeposits.forEach(dep => {
      summary.actualExpense += dep.amount;

      ledger.push({
        id: dep._id,
        code: dep.transactionCode || "REF-" + dep._id.toString().slice(-5).toUpperCase(),
        date: dep.refundDate,
        room: dep.room ? dep.room.name : "N/A",
        transactionType: "CHI",
        category: "Hoàn cọc giữ chỗ",
        paymentMethod: "Chuyển khoản",
        description: `Trả lại tiền cọc giữ chỗ cho ${dep.name}`,
        inflow: 0,
        outflow: dep.amount,
        status: "Đã chi"
      });
    });

    ledger.sort((a, b) => new Date(b.date) - new Date(a.date));

    summary.netCashFlow = summary.actualCollected - summary.actualExpense;
    summary.collectionRate = summary.expectedRevenue > 0
      ? ((summary.actualCollected / summary.expectedRevenue) * 100).toFixed(2)
      : 0;

    return { summary, ledger };
  }

  // ==========================================
  // LẤY BÁO CÁO KẾT QUẢ KINH DOANH (P&L / REVENUE REPORT)
  // ==========================================
  async getRevenueReport(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // [LOGIC PHÂN BỔ DOANH THU - ACCRUAL BASIS]
    // Lấy tất cả hóa đơn (trừ nháp) để kiểm tra sự giao thoa về thời gian
    const periodicInvoices = await InvoicePeriodic.find({
      status: { $ne: "Draft" }
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    const incurredInvoices = await InvoiceIncurred.find({
      status: { $ne: "Draft" }
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    const financialTickets = await FinancialTicket.find({
      transactionDate: { $gte: start, $lte: end },
      status: { $in: ["Completed", "Paid", "Approved"] }
    });

    const forfeitedDeposits = await Deposit.find({
      status: { $in: ["Expired", "Forfeited"] },
      updatedAt: { $gte: start, $lte: end }
    }).populate('room');

    let pnlLedger = [];
    let summary = {
      recognizedRevenue: 0,
      recognizedExpense: 0,
      netProfit: 0,
      profitMargin: 0
    };

    const getRoomName = (inv) => {
      if (inv.contractId && inv.contractId.roomId) return inv.contractId.roomId.name;
      return "N/A";
    };

    periodicInvoices.forEach(inv => {
      const created = new Date(inv.createdAt);
      inv.items.forEach(item => {
        const distAmt = this._getDistributedAmount(item.amount, item.itemName || inv.title, start, end, created);
        if (distAmt > 0) {
          const isPrepaid = item.itemName.toLowerCase().includes("trả trước") || inv.title.toLowerCase().includes("trả trước");
          summary.recognizedRevenue += distAmt;
          pnlLedger.push({
            id: inv._id + item._id,
            date: inv.createdAt,
            code: inv.invoiceCode,
            room: getRoomName(inv),
            description: item.itemName,
            category: isPrepaid ? "Doanh thu Tiền phòng trả trước (Phân bổ)" : "Doanh thu Định kỳ",
            revenue: distAmt,
            expense: 0,
            status: inv.status === "Paid" ? "Đã thu tiền" : "Đang nợ"
          });
        }
      });
    });

    incurredInvoices.forEach(inv => {
      const created = new Date(inv.createdAt);
      const distAmt = this._getDistributedAmount(inv.totalAmount, inv.title, start, end, created);

      if (distAmt > 0) {
        summary.recognizedRevenue += distAmt;
        pnlLedger.push({
          id: inv._id,
          date: inv.createdAt,
          code: inv.invoiceCode,
          room: getRoomName(inv),
          description: inv.title,
          category: inv.type === "prepaid" ? "Doanh thu Trả trước (Phân bổ)" : "Doanh thu Phạt/Sửa chữa",
          revenue: distAmt,
          expense: 0,
          status: inv.status === "Paid" ? "Đã thu tiền" : "Đang nợ"
        });
      }
    });

    forfeitedDeposits.forEach(dep => {
      summary.recognizedRevenue += dep.amount;

      pnlLedger.push({
        id: dep._id,
        date: dep.updatedAt,
        code: dep.transactionCode || "DEP-" + dep._id.toString().slice(-5).toUpperCase(),
        room: dep.room ? dep.room.name : "N/A",
        description: `Thu tiền cọc giữ chỗ do khách bỏ/quá hạn (${dep.name})`,
        category: "Doanh thu Mất cọc",
        revenue: dep.amount,
        expense: 0,
        status: "Đã thu tiền"
      });
    });

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

    summary.netProfit = summary.recognizedRevenue - summary.recognizedExpense;
    summary.profitMargin = summary.recognizedRevenue > 0
      ? ((summary.netProfit / summary.recognizedRevenue) * 100).toFixed(2)
      : 0;

    return { summary, ledger: pnlLedger };
  }
}

module.exports = new FinanceService();