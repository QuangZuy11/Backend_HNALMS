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

    // [MỚI] Query tiền cọc giữ chỗ đã QUÁ HẠN / BỎ CỌC trong tháng hiện tại
    const forfeitedDeposits = await Deposit.find({
        status: { $in: ["Expired", "Forfeited"] }, // Lấy các trạng thái khách mất cọc
        updatedAt: { $gte: startOfMonth, $lte: endOfMonth } // Tính theo ngày cọc hết hạn/bị hủy
    });

    // ==========================================
    // 2. TÍNH TOÁN 4 THẺ TỔNG QUAN (SUMMARY CARDS)
    // ==========================================
    let totalRevenuePeriodic = 0;
    let totalRevenueIncurred = 0;
    let totalDebtPeriodic = 0;
    let totalDebtIncurred = 0;

    let prepaidRentRev = 0;     // Tiền phòng trả trước
    let violationRev = 0;       // Tiền phạt, vi phạm
    let repairRev = 0;          // Tiền sửa chữa
    let guestDepositRev = 0;    // [MỚI] Tiền khách bỏ cọc

    periodicInvoices.forEach(inv => {
      if (inv.status === "Paid") totalRevenuePeriodic += inv.totalAmount;
      if (inv.status === "Unpaid") totalDebtPeriodic += inv.totalAmount;
    });

    incurredInvoices.forEach(inv => {
      if (inv.status === "Paid") {
          totalRevenueIncurred += inv.totalAmount; 
          
          if (inv.type === "prepaid") {
              prepaidRentRev += inv.totalAmount;
          } else if (inv.type === "violation") {
              violationRev += inv.totalAmount;
          } else {
              repairRev += inv.totalAmount;
          }
      }
      if (inv.status === "Unpaid") totalDebtIncurred += inv.totalAmount;
    });

    // [MỚI] Tính tổng tiền khách bỏ cọc
    forfeitedDeposits.forEach(dep => {
        guestDepositRev += dep.amount;
    });

    // [CẬP NHẬT] Tổng thu bằng Định kỳ + Phát sinh + Tiền mất cọc
    const totalRevenue = totalRevenuePeriodic + totalRevenueIncurred + guestDepositRev;
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

    const revenueBreakdown = [
      { name: "Tiền phòng (Định kỳ)", value: rentRev },
      { name: "Tiền phòng trả trước", value: prepaidRentRev }, 
      { name: "Tiền điện", value: elecRev },
      { name: "Tiền nước", value: waterRev },
      { name: "Dịch vụ khác", value: serviceRev },
      { name: "Phạt vi phạm", value: violationRev }, 
      { name: "Đền bù sửa chữa", value: repairRev },
      { name: "Khách bỏ cọc giữ chỗ", value: guestDepositRev } // [MỚI] Hiển thị khoản thu "trên trời" này
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
      const lostDeps = await Deposit.find({ status: { $in: ["Expired", "Forfeited"] }, updatedAt: { $gte: sDate, $lte: eDate } }); // [MỚI]

      const rev = pInv.reduce((s, x) => s + x.totalAmount, 0) + 
                  iInv.reduce((s, x) => s + x.totalAmount, 0) + 
                  lostDeps.reduce((s, x) => s + x.amount, 0); // [MỚI] Cộng vào doanh thu tháng
      const exp = tix.reduce((s, x) => s + x.amount, 0);

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
      summary: { totalRevenue, totalExpense, netProfit, totalDebt },
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

    // [MỚI] Lấy các khoản cọc khách đưa (Tiền vào)
    const incomingDeposits = await Deposit.find({
        createdAt: { $gte: start, $lte: end }
    }).populate('room');

    // [MỚI] Lấy các khoản cọc trả lại khách (Tiền ra)
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
        category: "Chi phí vận hành", 
        paymentMethod: ticket.paymentMethod || "-",
        description: ticket.title + (ticket.rejectionReason ? ` (Lý do: ${ticket.rejectionReason})` : ""),
        inflow: 0,
        outflow: ticket.amount,
        status: ticket.status
      });
    });

    // [MỚI] --- Bóc tách Cọc giữ chỗ (Tiền vào quỹ nhưng CHƯA PHẢI DOANH THU) ---
    incomingDeposits.forEach(dep => {
        summary.actualCollected += dep.amount; // Tăng tồn quỹ
        
        ledger.push({
            id: dep._id,
            code: dep.transactionCode || "DEP-" + dep._id.toString().slice(-5).toUpperCase(),
            date: dep.createdAt, // Ngày thu cọc
            room: dep.room ? dep.room.name : "N/A",
            transactionType: "THU",
            category: "Thu cọc giữ chỗ (Khách ngoài)",
            paymentMethod: "Chuyển khoản",
            description: `Nhận cọc giữ chỗ của ${dep.name} - SĐT: ${dep.phone}`,
            inflow: dep.amount,
            outflow: 0,
            status: "Đã thu" // Đã cầm tiền
        });
    });

    // [MỚI] --- Bóc tách Hoàn Cọc (Tiền ra khỏi quỹ) ---
    refundedDeposits.forEach(dep => {
        summary.actualExpense += dep.amount; // Giảm tồn quỹ
        
        ledger.push({
            id: dep._id,
            code: dep.transactionCode || "REF-" + dep._id.toString().slice(-5).toUpperCase(),
            date: dep.refundDate, // Ngày trả cọc
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

    // [MỚI] Lấy các cọc khách bỏ / vi phạm trong kỳ (ĐƯỢC GHI NHẬN LÀ DOANH THU)
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

    // [MỚI] --- Ghi nhận Doanh thu từ Cọc Khách Bỏ ---
    forfeitedDeposits.forEach(dep => {
        summary.recognizedRevenue += dep.amount; // Cộng vào tổng Lợi nhuận
        
        pnlLedger.push({
            id: dep._id,
            date: dep.updatedAt, // Ngày chính thức chuyển thành doanh thu
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

    // Tính lợi nhuận
    summary.netProfit = summary.recognizedRevenue - summary.recognizedExpense;
    summary.profitMargin = summary.recognizedRevenue > 0 
      ? ((summary.netProfit / summary.recognizedRevenue) * 100).toFixed(2) 
      : 0;

    return { summary, ledger: pnlLedger };
  }
}

module.exports = new FinanceService();