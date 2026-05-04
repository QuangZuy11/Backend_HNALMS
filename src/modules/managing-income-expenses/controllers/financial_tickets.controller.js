const FinancialTicket = require("../models/financial_tickets");
const RepairRequest = require("../../request-management/models/repair_requests.model");
const Contract = require("../../contract-management/models/contract.model");
const Room = require("../../room-floor-management/models/room.model");
const ContractLiquidation = require("../../contract-management/models/contract_liquidation.model");
const Deposit = require("../../contract-management/models/deposit.model");

const buildTodayVoucherPrefix = () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `PAY-${dd}${mm}${yyyy}-`;
};

const getNextManualPaymentVoucher = async () => {
  const prefix = buildTodayVoucherPrefix();

  const latest = await FinancialTicket.findOne({
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

    // Chỉ lấy các ticket có referenceId là RepairRequest (phiếu chi thường) HOẶC là contract liquidation
    const filter = { referenceId: { $exists: true } };

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

    // Sử dụng conditional select để populate đúng model theo loại ticket
    let tickets = await FinancialTicket.find(filter)
      .sort({ transactionDate: -1 })
      .lean();

    if (roomSearch && roomSearch.trim()) {
      const searchTerm = roomSearch.trim().toLowerCase();
      const filteredTickets = [];

      for (const ticket of tickets) {
        if (!ticket.referenceId) continue;
        let roomMatched = false;

        const refId = typeof ticket.referenceId === "object" ? ticket.referenceId._id : ticket.referenceId;

        // Thử tìm contract trực tiếp
        const ContractModel = require("../../contract-management/models/contract.model");
        let contract = await ContractModel.findById(refId)
          .populate({ path: "roomId", select: "_id name roomCode", model: Room })
          .lean();

        if (contract && contract.roomId) {
          const roomName = (contract.roomId.name || "").toLowerCase();
          const roomCode = (contract.roomId.roomCode || "").toLowerCase();
          if (roomName.includes(searchTerm) || roomCode.includes(searchTerm)) {
            filteredTickets.push(ticket);
            continue;
          }
        }

        // Thử tìm qua RepairRequest → contract active
        const RepairRequestModel = require("../../request-management/models/repair_requests.model");
        const repair = await RepairRequestModel.findById(refId).select("tenantId").lean();
        if (repair && repair.tenantId) {
          const activeContract = await ContractModel.findOne({
            tenantId: repair.tenantId,
            status: "active",
          })
            .populate({ path: "roomId", select: "_id name roomCode", model: Room })
            .lean();

          if (activeContract && activeContract.roomId) {
            const roomName = (activeContract.roomId.name || "").toLowerCase();
            const roomCode = (activeContract.roomId.roomCode || "").toLowerCase();
            if (roomName.includes(searchTerm) || roomCode.includes(searchTerm)) {
              filteredTickets.push(ticket);
            }
          }
        }
      }

      tickets = filteredTickets;
    }

    // Helper: lấy room info từ ticket
    // referenceId có thể là Contract (_id) hoặc RepairRequest (có tenantId)
    const getRoomFromTicket = async (ticket) => {
      if (!ticket.referenceId) return null;

      // referenceId là string (ObjectId) khi dùng lean()
      const refId = typeof ticket.referenceId === "object" ? ticket.referenceId._id : ticket.referenceId;

      // Thử populate referenceId với cả Contract và RepairRequest
      const ContractModel = require("../../contract-management/models/contract.model");
      let contract = await ContractModel.findById(refId)
        .populate({ path: "roomId", select: "_id name roomCode", model: Room })
        .lean();

      // Nếu tìm được contract → đây là liquidation ticket
      if (contract && contract.roomId) {
        return {
          _id: contract.roomId._id,
          name: contract.roomId.name,
          roomCode: contract.roomId.roomCode,
        };
      }

      // Ngược lại → có thể là RepairRequest, tìm contract qua tenantId
      const RepairRequestModel = require("../../request-management/models/repair_requests.model");
      const repair = await RepairRequestModel.findById(refId).select("tenantId").lean();
      if (repair && repair.tenantId) {
        const activeContract = await ContractModel.findOne({
          tenantId: repair.tenantId,
          status: "active",
        })
          .populate({ path: "roomId", select: "_id name roomCode", model: Room })
          .lean();

        if (activeContract && activeContract.roomId) {
          return {
            _id: activeContract.roomId._id,
            name: activeContract.roomId.name,
            roomCode: activeContract.roomId.roomCode,
          };
        }
      }

      return null;
    };

    const ticketsWithRoom = await Promise.all(
      tickets.map(async (ticket) => {
        const room = await getRoomFromTicket(ticket);
        return { ...ticket, room };
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
 * PATCH /api/financial-tickets/:id/status
 * Cập nhật trạng thái thanh toán cho phiếu chi
 * Body: { status: "Pending" | "Approved" | "Paid" | "Rejected" }
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

    const allowed = ["Pending", "Approved", "Paid", "Rejected"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          'Trạng thái không hợp lệ. Chỉ chấp nhận "Pending", "Approved", "Paid" hoặc "Cancelled".',
      });
    }

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

    if (status !== "Paid") {
      updateQuery.$set.accountantPaidAt = null;
    }

    if (status !== "Rejected") {
      updateQuery.$set.rejectionReason = null;
    }

    const updated = await FinancialTicket.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true }
    ).lean();

    // ── Xử lý ContractLiquidation liên quan đến phiếu chi thanh lý ──
    // Luồng: pending_owner (owner duyệt) → pending_accountant (accountant giải ngân) → completed
    const liquidation = await ContractLiquidation.findOne({ invoiceId: id });
    if (liquidation) {
      if (status === "Approved") {
        // Owner duyệt → chuyển sang chờ kế toán giải ngân
        liquidation.status = "pending_accountant";
        liquidation.ownerApprovedAt = new Date();
        liquidation.ownerApprovedBy = req.user?._id || null;
        await liquidation.save();
      } else if (status === "Paid") {
        // Accountant giải ngân → hoàn tất thanh lý
        liquidation.status = "completed";
        liquidation.accountantPaidAt = new Date();
        await liquidation.save();

        // Thực hiện chấm dứt hợp đồng và cập nhật phòng/cọc
        const contract = await Contract.findById(liquidation.contractId);
        if (contract) {
          contract.status = "terminated";
          await contract.save();

          if (contract.depositId) {
            const deposit = await Deposit.findById(
              contract.depositId._id || contract.depositId
            );
            if (deposit) {
              if (liquidation.liquidationType === "force_majeure") {
                deposit.status = "Refunded";
                deposit.refundDate = new Date();
              } else {
                deposit.status = "Forfeited";
                deposit.forfeitedDate = new Date();
              }
              await deposit.save();
            }
          }

          const room = await Room.findById(contract.roomId);
          if (room) {
            const allRoomContracts = await Contract.find({ roomId: room._id }).select("_id");
            const boundContractIds = new Set(allRoomContracts.map((c) => c._id.toString()));

            const floatingDeposits = await Deposit.find({ room: room._id, status: "Held" });
            const hasFloatingDeposit = floatingDeposits.some((d) => {
              if (!d.contractId) return true;
              if (!boundContractIds.has(d.contractId.toString())) return true;
              return false;
            });

            room.status = hasFloatingDeposit ? "Deposited" : "Available";
            await room.save();
          }
        }
      } else if (status === "Rejected") {
        // Owner từ chối → liquidation vẫn giữ pending_owner, không làm gì thêm
      }
    }

    return res.status(200).json({
      success: true,
      data: updated,
      message: "Cập nhật trạng thái thành công",
    });
  } catch (error) {
    console.error("Error updating payment ticket status:", error);
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
};

