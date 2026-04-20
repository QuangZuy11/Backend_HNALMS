const InvoicePeriodic = require("../../invoice-management/models/invoice_periodic.model");
const InvoiceIncurred = require("../../invoice-management/models/invoice_incurred.model");
const FinancialTicket = require("../../managing-income-expenses/models/financial_tickets");
const Deposit = require("../../contract-management/models/deposit.model");

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
    // Lưu ý: Biểu đồ tròn mang ý nghĩa LỢI NHUẬN, nên ta dùng Forfeited Deposits (Khách bỏ cọc)
    let rentRev = 0, elecRev = 0, waterRev = 0, serviceRev = 0;
    periodicInvoices.forEach(inv => {
      if (inv.status === "Paid") {
        const isPrepaid = inv.title && inv.title.toLowerCase().includes("trả trước");
        
        // Nếu là trả trước, ta đã tính vào prepaidRentRev ở trên, không cộng vào rentRev nữa
        // Tuy nhiên vẫn cần cộng điện, nước nếu có (đề phòng trường hợp hiếm)
        inv.items.forEach(item => {
          const name = item.itemName.toLowerCase();
          if (name.includes("phòng")) {
            if (!isPrepaid) rentRev += item.amount;
          } else if (name.includes("điện")) {
            elecRev += item.amount;
          } else if (name.includes("nước")) {
            waterRev += item.amount;
          } else {
            serviceRev += item.amount;
          }
        });
      }
    });

    let guestDepositRev = 0;
    forfeitedDeposits.forEach(dep => { guestDepositRev += dep.amount; });

    const revenueBreakdown = [
      { name: "Tiền phòng (Định kỳ)", value: rentRev },
      { name: "Tiền phòng trả trước", value: prepaidRentRev },
      { name: "Tiền điện", value: elecRev },
      { name: "Tiền nước", value: waterRev },
      { name: "Dịch vụ khác", value: serviceRev },
      { name: "Phạt vi phạm", value: violationRev },
      { name: "Đền bù sửa chữa", value: repairRev },
      { name: "Khách bỏ cọc giữ chỗ", value: guestDepositRev }
    ].filter(item => item.value > 0);

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

      // [FIX LỖI] Biểu đồ 6 tháng cũng phải dùng Cọc Thu / Cọc Hoàn
      const incDeps = await Deposit.find({ createdAt: { $gte: sDate, $lte: eDate } });
      const refDeps = await Deposit.find({ status: "Refunded", refundDate: { $gte: sDate, $lte: eDate } });

      const rev = pInv.reduce((s, x) => s + x.totalAmount, 0) +
        iInv.reduce((s, x) => s + x.totalAmount, 0) +
        incDeps.reduce((s, x) => s + x.amount, 0); // Cộng cọc thu
      const exp = tix.reduce((s, x) => s + x.amount, 0) +
        refDeps.reduce((s, x) => s + x.amount, 0); // Cộng cọc hoàn

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

    const periodicInvoices = await InvoicePeriodic.find({
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Draft" }
    }).populate({ path: 'contractId', select: 'roomId', populate: { path: 'roomId', select: 'name' } });

    const incurredInvoices = await InvoiceIncurred.find({
      createdAt: { $gte: start, $lte: end },
      status: { $ne: "Draft" },
      type: { $ne: "prepaid" }
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
      const isPrepaid = inv.title && inv.title.toLowerCase().includes("trả trước");
      summary.recognizedRevenue += inv.totalAmount;
      pnlLedger.push({
        id: inv._id,
        date: inv.createdAt,
        code: inv.invoiceCode,
        room: getRoomName(inv),
        description: inv.title,
        category: isPrepaid ? "Doanh thu Tiền phòng trả trước" : "Doanh thu Định kỳ",
        revenue: inv.totalAmount,
        expense: 0,
        status: inv.status === "Paid" ? "Đã thu tiền" : "Đang nợ"
      });
    });

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