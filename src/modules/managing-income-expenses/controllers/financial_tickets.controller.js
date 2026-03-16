const FinancialTicket = require("../models/financial_tickets");
const RepairRequest = require("../../request-management/models/repair_requests.model");
const Contract = require("../../contract-management/models/contract.model");
const Room = require("../../room-floor-management/models/room.model");

const buildTodayVoucherPrefix = () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `PAY-${dd}${mm}${yyyy}-`;
};

const buildTodayReceiptPrefix = () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `RC-${dd}${mm}${yyyy}-`;
};

const getNextManualPaymentVoucher = async () => {
  const prefix = buildTodayVoucherPrefix();

  const latest = await FinancialTicket.findOne({
    type: "Payment",
    paymentVoucher: { $regex: `^${prefix}\\d{4}$` },
  })
    .select("paymentVoucher")
    .sort({ paymentVoucher: -1 })
    .lean();

  let nextNumber = 1;
  if (latest?.paymentVoucher) {
    const suffix = latest.paymentVoucher.slice(prefix.length);
    const parsed = parseInt(suffix, 10);
    if (!Number.isNaN(parsed)) {
      nextNumber = parsed + 1;
    }
  }

  for (let i = 0; i < 100; i += 1) {
    if (nextNumber > 9999) {
      throw new Error("Đã vượt quá giới hạn mã phiếu chi trong ngày (9999)");
    }

    const candidate = `${prefix}${String(nextNumber).padStart(4, "0")}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await FinancialTicket.exists({ paymentVoucher: candidate });
    if (!exists) return candidate;

    nextNumber += 1;
  }

  throw new Error("Không thể tạo mã phiếu chi mới, vui lòng thử lại");
};

/**
 * GET /api/financial-tickets/payments/next-voucher
 * Lấy mã phiếu chi kế tiếp theo format PAY-DDMMYYYY-XXXX
 */
const getNextPaymentVoucherCode = async (_req, res) => {
  try {
    const paymentVoucher = await getNextManualPaymentVoucher();

    return res.status(200).json({
      success: true,
      data: { paymentVoucher },
      message: "Lấy mã phiếu chi kế tiếp thành công",
    });
  } catch (error) {
    console.error("Error getting next manual payment voucher:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Không thể tạo mã phiếu chi",
    });
  }
};

/**
 * POST /api/financial-tickets/payments
 * Tạo phiếu chi thủ công cho manager nhập liệu
 * Body: { title, amount }
 */
const createManualPaymentTicket = async (req, res) => {
  try {
    const { title, amount } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tiêu đề",
      });
    }

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber < 1000) {
      return res.status(400).json({
        success: false,
        message: "Số tiền không hợp lệ. Số tiền phải lớn hơn hoặc bằng 1.000 VNĐ",
      });
    }

    const paymentVoucher = await getNextManualPaymentVoucher();

    const newTicket = await FinancialTicket.create({
      type: "Payment",
      amount: amountNumber,
      title: String(title).trim(),
      status: paymentVoucher?.startsWith("PAY-") ? "Pending" : "Created",
      paymentVoucher,
      transactionDate: new Date(),
      accountantPaidAt: null,
      referenceId: null,
    });

    return res.status(201).json({
      success: true,
      data: newTicket,
      message: "Tạo phiếu chi thành công",
    });
  } catch (error) {
    console.error("Error creating manual payment ticket:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Không thể tạo phiếu chi",
    });
  }
};

/**
 * GET /api/financial-tickets/payments
 * Lấy danh sách phiếu chi (Payment) cho kế toán
 * Query params: from, to, keyword, roomSearch (tìm kiếm theo tên phòng hoặc roomCode)
 */
const getPaymentTickets = async (req, res) => {
  try {
    const { from, to, keyword, roomSearch } = req.query || {};

    const filter = { type: "Payment" };

    if (from || to) {
      filter.transactionDate = {};
      if (from) {
        filter.transactionDate.$gte = new Date(from);
      }
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        filter.transactionDate.$lte = endDate;
      }
    }

    if (keyword) {
      filter.title = { $regex: keyword, $options: "i" };
    }

    let tickets = await FinancialTicket.find(filter)
      .populate({
        path: "referenceId",
        model: RepairRequest,
        select: "tenantId",
      })
      .sort({ transactionDate: -1 })
      .lean();

    if (roomSearch && roomSearch.trim()) {
      const searchTerm = roomSearch.trim().toLowerCase();
      const filteredTickets = [];

      for (const ticket of tickets) {
        if (ticket.referenceId && ticket.referenceId.tenantId) {
          // eslint-disable-next-line no-await-in-loop
          const activeContract = await Contract.findOne({
            tenantId: ticket.referenceId.tenantId,
            status: "active",
          })
            .populate({
              path: "roomId",
              select: "_id name roomCode",
              model: Room,
            })
            .lean();

          if (activeContract && activeContract.roomId) {
            const room = activeContract.roomId;
            const roomName = (room.name || "").toLowerCase();
            const roomCode = (room.roomCode || "").toLowerCase();

            if (roomName.includes(searchTerm) || roomCode.includes(searchTerm)) {
              filteredTickets.push(ticket);
            }
          }
        }
      }

      tickets = filteredTickets;
    }

    const ticketsWithRoom = await Promise.all(
      tickets.map(async (ticket) => {
        let roomInfo = null;

        if (ticket.referenceId && ticket.referenceId.tenantId) {
          const activeContract = await Contract.findOne({
            tenantId: ticket.referenceId.tenantId,
            status: "active",
          })
            .populate({
              path: "roomId",
              select: "_id name roomCode",
              model: Room,
            })
            .lean();

          if (activeContract && activeContract.roomId) {
            roomInfo = {
              _id: activeContract.roomId._id,
              name: activeContract.roomId.name,
              roomCode: activeContract.roomId.roomCode,
            };
          }
        }

        return {
          ...ticket,
          room: roomInfo,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: ticketsWithRoom,
      total: ticketsWithRoom.length,
    });
  } catch (error) {
    console.error("Error fetching payment tickets:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách phiếu chi",
    });
  }
};

/**
 * GET /api/financial-tickets/receipts
 * Lấy danh sách phiếu thu (Receipt) cho kế toán
 * Query params: from, to, keyword, status ("Paid" | "Unpaid")
 */
const getReceiptTickets = async (req, res) => {
  try {
    const { from, to, keyword, status } = req.query || {};

    const filter = { type: "Receipt" };

    if (from || to) {
      filter.transactionDate = {};
      if (from) {
        filter.transactionDate.$gte = new Date(from);
      }
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        filter.transactionDate.$lte = endDate;
      }
    }

    if (keyword) {
      filter.title = { $regex: keyword, $options: "i" };
    }

    if (status && typeof status === "string") {
      const normalized = status.trim();
      if (["Paid", "Unpaid"].includes(normalized)) {
        filter.status = normalized;
      }
    }

    const tickets = await FinancialTicket.find(filter)
      .sort({ transactionDate: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: tickets,
      total: tickets.length,
    });
  } catch (error) {
    console.error("Error fetching receipt tickets:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách phiếu thu",
    });
  }
};

const getNextManualReceiptVoucher = async () => {
  const prefix = buildTodayReceiptPrefix();

  const latest = await FinancialTicket.findOne({
    type: "Receipt",
    paymentVoucher: { $regex: `^${prefix}\\d{4}$` },
  })
    .select("paymentVoucher")
    .sort({ paymentVoucher: -1 })
    .lean();

  let nextNumber = 1;
  if (latest?.paymentVoucher) {
    const suffix = latest.paymentVoucher.slice(prefix.length);
    const parsed = parseInt(suffix, 10);
    if (!Number.isNaN(parsed)) {
      nextNumber = parsed + 1;
    }
  }

  for (let i = 0; i < 100; i += 1) {
    if (nextNumber > 9999) {
      throw new Error("Đã vượt quá giới hạn mã phiếu thu trong ngày (9999)");
    }

    const candidate = `${prefix}${String(nextNumber).padStart(4, "0")}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await FinancialTicket.exists({ paymentVoucher: candidate });
    if (!exists) return candidate;

    nextNumber += 1;
  }

  throw new Error("Không thể tạo mã phiếu thu mới, vui lòng thử lại");
};

/**
 * GET /api/financial-tickets/receipts/next-voucher
 * Lấy mã phiếu thu kế tiếp theo format RC-DDMMYYYY-XXXX
 */
const getNextReceiptVoucherCode = async (_req, res) => {
  try {
    const paymentVoucher = await getNextManualReceiptVoucher();

    return res.status(200).json({
      success: true,
      data: { paymentVoucher },
      message: "Lấy mã phiếu thu kế tiếp thành công",
    });
  } catch (error) {
    console.error("Error getting next manual receipt voucher:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Không thể tạo mã phiếu thu",
    });
  }
};

/**
 * POST /api/financial-tickets/receipts
 * Tạo phiếu thu thủ công
 * Body: { title, amount, status: "Unpaid" | "Paid" }
 */
const createManualReceiptTicket = async (req, res) => {
  try {
    const { title, amount, status } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tiêu đề",
      });
    }

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber < 1000) {
      return res.status(400).json({
        success: false,
        message: "Số tiền không hợp lệ. Số tiền phải lớn hơn hoặc bằng 1.000 VNĐ",
      });
    }

    const allowed = ["Paid", "Unpaid"];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái không hợp lệ. Chỉ chấp nhận "Paid" hoặc "Unpaid".',
      });
    }

    const paymentVoucher = await getNextManualReceiptVoucher();

    const newTicket = await FinancialTicket.create({
      type: "Receipt",
      amount: amountNumber,
      title: String(title).trim(),
      status,
      paymentVoucher,
      transactionDate: new Date(),
      accountantPaidAt: status === "Paid" ? new Date() : null,
      referenceId: null,
    });

    return res.status(201).json({
      success: true,
      data: newTicket,
      message: "Tạo phiếu thu thành công",
    });
  } catch (error) {
    console.error("Error creating manual receipt ticket:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Không thể tạo phiếu thu",
    });
  }
};

/**
 * PATCH /api/financial-tickets/:id/status
 * Cập nhật trạng thái thanh toán cho phiếu chi / phiếu thu (Payment / Receipt)
 * Body: { status: "Pending" | "Paid" | "Cancelled" | "Unpaid" }
 */
const updatePaymentTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentVoucher, rejectionReason } = req.body || {};

    const ticket = await FinancialTicket.findById(id).lean();
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiếu",
      });
    }

    const allowed =
      ticket.type === "Payment"
        ? ["Pending", "Approved", "Paid", "Rejected"]
        : ["Paid", "Unpaid"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          ticket.type === "Payment"
            ? 'Trạng thái không hợp lệ. Chỉ chấp nhận "Pending", "Approved", "Paid" hoặc "Cancelled".'
            : 'Trạng thái không hợp lệ. Chỉ chấp nhận "Paid" hoặc "Unpaid".',
      });
    }

    if (ticket.type === "Payment") {
      if (["Paid", "Rejected"].includes(ticket.status)) {
        return res.status(400).json({
          success: false,
          message: "Phiếu chi đã được xử lý, không thể cập nhật lại.",
        });
      }

      if (req.user?.role === "owner" && status !== "Approved" && status !== "Rejected") {
        return res.status(403).json({
          success: false,
          message: "Chủ nhà chỉ được duyệt hoặc từ chối phiếu chi.",
        });
      }

      if (req.user?.role === "accountant" && status !== "Paid") {
        return res.status(403).json({
          success: false,
          message: "Kế toán chỉ được xác nhận đã thanh toán phiếu chi.",
        });
      }

      if (status === "Rejected" && !String(rejectionReason || "").trim()) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập lý do từ chối phiếu chi.",
        });
      }
    }

    const updateQuery = {
      $set: {
        status,
      },
    };

    if (status === "Rejected") {
      updateQuery.$set.rejectionReason = String(rejectionReason || "").trim();
    }

    if (status === "Paid") {
      updateQuery.$set.accountantPaidAt = new Date();
      if (paymentVoucher) {
        updateQuery.$set.paymentVoucher = paymentVoucher;
      }
    }

    if (status !== "Paid" && ticket.type === "Payment") {
      updateQuery.$set.accountantPaidAt = null;
    }

    if (status !== "Rejected" && ticket.type === "Payment") {
      updateQuery.$set.rejectionReason = null;
    }

    const updated = await FinancialTicket.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true }
    ).lean();

    return res.status(200).json({
      success: true,
      data: updated,
      message: "Cập nhật trạng thái thành công",
    });
  } catch (error) {
    console.error("Error updating payment/receipt ticket status:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật trạng thái phiếu",
    });
  }
};

module.exports = {
  getPaymentTickets,
  updatePaymentTicketStatus,
  getNextPaymentVoucherCode,
  createManualPaymentTicket,
  getReceiptTickets,
  getNextReceiptVoucherCode,
  createManualReceiptTicket,
};
