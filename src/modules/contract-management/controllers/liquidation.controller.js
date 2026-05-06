const mongoose = require("mongoose");
const Contract = require("../models/contract.model");
const ContractLiquidation = require("../models/contract_liquidation.model");
const Deposit = require("../models/deposit.model");
const Room = require("../../room-floor-management/models/room.model");
const User = require("../../authentication/models/user.model");
const MeterReading = require("../../invoice-management/models/meterreading.model");
const InvoicePeriodic = require("../../invoice-management/models/invoice_periodic.model");
const Service = require("../../service-management/models/service.model");
const FinancialTicket = require("../../managing-income-expenses/models/financial_tickets");
const { sendEmail } = require("../../notification-management/services/email.service");
const { EMAIL_TEMPLATES } = require("../../../shared/config/email");

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Sinh mã hóa đơn tất toán */
const generateSettlementInvoiceCode = () => {
  const date = new Date();
  const prefix = `HD-TATOAN-${String(date.getDate()).padStart(2, "0")}${String(
    date.getMonth() + 1
  ).padStart(2, "0")}${date.getFullYear()}`;
  const seq = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
  return `${prefix}-${seq}`;
};

/** Lấy giá trị số từ Decimal128 hoặc Number */
const toNumber = (val) => {
  if (!val) return 0;
  if (typeof val === "object" && val.$numberDecimal)
    return parseFloat(val.$numberDecimal);
  return Number(val);
};

/** Lấy chỉ số cũ mới nhất từ meterreadings — sắp xếp theo readingDate DESC, createdAt DESC */
const getLatestIndex = async (roomId, utilityId) => {
  const latest = await MeterReading.findOne({ roomId, utilityId }).sort({
    readingDate: -1,
    createdAt: -1,
  });
  return latest ? { newIndex: latest.newIndex, reading: latest } : { newIndex: 0, reading: null };
};

const getEffectiveSettlementType = (liquidation) => {
  if (liquidation?.settlementType) return liquidation.settlementType;
  return liquidation?.totalSettlement >= 0 ? "refund" : "collect";
};

const isSettlementPaid = async (liquidation) => {
  if (!liquidation) return false;
  const settlementType = getEffectiveSettlementType(liquidation);

  if (settlementType === "collect") {
    if (liquidation.invoiceId?.status) return liquidation.invoiceId.status === "Paid";
    if (!liquidation.invoiceId) return false;
    const invoice = await InvoicePeriodic.findById(liquidation.invoiceId).select("status");
    return invoice?.status === "Paid";
  }

  if (settlementType === "refund") {
    if (liquidation.financialTicketId?.status) return liquidation.financialTicketId.status === "Paid";
    if (!liquidation.financialTicketId) return false;
    const ticket = await FinancialTicket.findById(liquidation.financialTicketId).select("status");
    return ticket?.status === "Paid";
  }

  return false;
};

const completeLiquidation = async (liquidation) => {
  if (!liquidation || liquidation.status === "completed") return;

  liquidation.status = "completed";
  await liquidation.save();

  const contract = await Contract.findById(liquidation.contractId);
  if (contract && contract.status !== "terminated") {
    contract.status = "terminated";
    await contract.save();
  }

  if (contract?.roomId) {
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
};

const syncLiquidationCompletion = async (liquidation) => {
  if (!liquidation || liquidation.status === "completed") return liquidation;
  const paid = await isSettlementPaid(liquidation);
  if (paid) await completeLiquidation(liquidation);
  return liquidation;
};

// ─────────────────────────────────────────────
// POST /liquidations/create
// ─────────────────────────────────────────────
exports.createLiquidation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      contractId,
      liquidationType,       // 'force_majeure' | 'violation'
      liquidationDate,
      note,
      images,
      electricServiceId,
      waterServiceId,
      electricNewIndex,
      waterNewIndex,
    } = req.body;

    // ── 1. Validate contract ──────────────────────────────────────────────
    const contract = await Contract.findById(contractId)
      .populate({ path: "roomId", populate: { path: "roomTypeId" } })
      .populate("tenantId", "email username phoneNumber status")
      .populate("depositId")
      .session(session);

    if (!contract) throw new Error("Không tìm thấy hợp đồng.");
    if (contract.status !== "active")
      throw new Error("Hợp đồng phải đang ở trạng thái active mới có thể thanh lý.");

    const room = contract.roomId;
    const roomPrice = toNumber(room?.roomTypeId?.currentPrice);
    const liqDate = new Date(liquidationDate);
    liqDate.setHours(12, 0, 0, 0);

    // ── 2. Tạo MeterReading records ───────────────────────────────────────
    const { newIndex: electricOldIndex } = await getLatestIndex(room._id, electricServiceId);
    const { newIndex: waterOldIndex } = await getLatestIndex(room._id, waterServiceId);

    const electricUsage = Math.max(0, Number(electricNewIndex) - electricOldIndex);
    const waterUsage = Math.max(0, Number(waterNewIndex) - waterOldIndex);

    const mrElectric = new MeterReading({
      roomId: room._id,
      utilityId: electricServiceId,
      oldIndex: electricOldIndex,
      newIndex: Number(electricNewIndex),
      usageAmount: electricUsage,
      readingDate: liqDate,
    });
    await mrElectric.save({ session });

    const mrWater = new MeterReading({
      roomId: room._id,
      utilityId: waterServiceId,
      oldIndex: waterOldIndex,
      newIndex: Number(waterNewIndex),
      usageAmount: waterUsage,
      readingDate: liqDate,
    });
    await mrWater.save({ session });

    // ── 3. Lấy đơn giá điện/nước ─────────────────────────────────────────
    const electricService = await Service.findById(electricServiceId).session(session);
    const waterService = await Service.findById(waterServiceId).session(session);
    if (!electricService) throw new Error("Không tìm thấy dịch vụ điện trong hệ thống.");
    if (!waterService) throw new Error("Không tìm thấy dịch vụ nước trong hệ thống.");

    const electricUnitPrice = toNumber(electricService.currentPrice);
    const waterUnitPrice = toNumber(waterService.currentPrice);
    const electricCost = electricUsage * electricUnitPrice;
    const waterCost = waterUsage * waterUnitPrice;
    const utilityCost = electricCost + waterCost;

    // ── 4. Tính tiền hoàn thuê còn dư (chỉ dùng cho force_majeure) ────────
    // Tái sử dụng logic từ getPreflightData: quét paid invoices, tính ngày chưa dùng
    const msPerDay = 1000 * 60 * 60 * 24;
    const isDepositRefunded = contract.depositId && contract.depositId.status === "Refunded";
    const depositAmount = contract.depositId ? toNumber(contract.depositId.amount) : 0;

    let remainingRentAmount = 0;
    if (liquidationType === "force_majeure") {
      const paidInvoices = await InvoicePeriodic.find({ contractId, status: "Paid" })
        .sort({ createdAt: 1 })
        .session(session)
        .lean();

      const parseVNDate = (str) => {
        const [d, m, y] = str.split("/").map(Number);
        return new Date(y, m - 1, d, 12, 0, 0);
      };
      const parsePeriodFromText = (text) => {
        const match = text.match(/từ (\d{2}\/\d{2}\/\d{4}) đến (\d{2}\/\d{2}\/\d{4})/i);
        if (!match) return null;
        return { from: parseVNDate(match[1]), to: parseVNDate(match[2]) };
      };

      for (const invoice of paidInvoices) {
        for (const item of invoice.items) {
          const nameLC = item.itemName.toLowerCase();
          if (!nameLC.includes("tiền thuê") && !nameLC.includes("tiền phòng")) continue;
          if (item.amount <= 0) continue;

          const period = parsePeriodFromText(item.itemName);
          if (!period) continue;

          const { from, to } = period;
          const totalDays = Math.round((to - from) / msPerDay) + 1;
          const dailyRate = totalDays > 0 ? item.amount / totalDays : 0;

          let unusedDays = 0;
          if (liqDate >= to) {
            unusedDays = 0;
          } else if (liqDate < from) {
            unusedDays = totalDays;
          } else {
            const usedDays = Math.round((liqDate - from) / msPerDay) + 1;
            unusedDays = totalDays - usedDays;
          }
          remainingRentAmount += Math.round(dailyRate * unusedDays);
        }
      }
    }

    // ── 5. Tính A theo loại thanh lý ──────────────────────────────────────
    // force_majeure: A = (hoàn cọc + hoàn thuê còn dư) - (điện + nước)
    // violation:     cọc = 0, thuê còn dư = 0, A = -(điện + nước) [tenant luôn phải trả]
    let depositRefundAmount = 0;
    let totalSettlement = 0;

    if (liquidationType === "force_majeure") {
      depositRefundAmount = isDepositRefunded ? 0 : depositAmount;
      // A = hoàn cọc + hoàn thuê còn dư - tiền điện nước
      totalSettlement = depositRefundAmount + remainingRentAmount - utilityCost;
    } else {
      // violation: cọc bị tịch thu, không hoàn thuê
      depositRefundAmount = 0;
      remainingRentAmount = 0;
      // Tenant phải trả tiền điện nước cuối kỳ
      totalSettlement = -utilityCost; // âm = tenant phải trả
    }

    // ── 6. Xác định loại tài chính & tạo chứng từ ────────────────────────
    //   A >= 0 (chỉ xảy ra với force_majeure): tenant nhận hoàn tiền
    //           → tạo Phiếu Chi (financial_tickets), status "Pending"
    //           → Chủ duyệt → Kế toán xác nhận chi → Done (màu xanh)
    //
    //   A < 0  : tenant phải thanh toán thêm
    //           → tạo Hóa Đơn (invoice_periodics), status "Unpaid"
    //           → Kế toán xác nhận đã thu → Done (màu đỏ)

    const typeLabel = liquidationType === "force_majeure" ? "Bất khả kháng" : "Vi phạm hợp đồng";
    const invoiceCode = generateSettlementInvoiceCode();
    const dueDate = new Date(liqDate.getTime() + 3 * 24 * 60 * 60 * 1000);

    let financialTicketDoc = null;  // phiếu chi (A >= 0)
    let invoicePeriodicDoc = null;  // hóa đơn thu (A < 0)
    let settlementType = "";

    if (totalSettlement >= 0) {
      // ── HOÀN TIỀN: Phiếu chi ─────────────────────────────────────────
      settlementType = "refund";

      const items = [];
      if (liquidationType === "force_majeure") {
        items.push({
          itemName: isDepositRefunded
            ? "Hoàn tiền cọc (Đã được hoàn từ trước)"
            : "Hoàn tiền cọc (100%)",
          usage: 1,
          unitPrice: depositRefundAmount,
          amount: depositRefundAmount,
          isIndex: false,
        });
        items.push({
          itemName: "Hoàn tiền thuê còn dư",
          usage: 1,
          unitPrice: remainingRentAmount,
          amount: remainingRentAmount,
          isIndex: false,
        });
        items.push({
          itemName: `Trừ tiền ${electricService.name} cuối kỳ`,
          oldIndex: electricOldIndex,
          newIndex: Number(electricNewIndex),
          usage: electricUsage,
          unitPrice: electricUnitPrice,
          amount: -electricCost,
          isIndex: true,
        });
        items.push({
          itemName: `Trừ tiền ${waterService.name} cuối kỳ`,
          oldIndex: waterOldIndex,
          newIndex: Number(waterNewIndex),
          usage: waterUsage,
          unitPrice: waterUnitPrice,
          amount: -waterCost,
          isIndex: true,
        });
      }

      // Phiếu chi lưu vào financial_tickets
      // Phiếu chi lưu vào financial_tickets
      // strict: false nên có thể lưu thêm items, contractId
      financialTicketDoc = new FinancialTicket({
        paymentVoucher: invoiceCode,
        contractId: contract._id,
        title: `Phiếu hoàn tiền thanh lý - ${typeLabel} - ${room.name}`,
        items,
        totalAmount: totalSettlement,
        amount: totalSettlement,          // số tiền hoàn (dương)
        status: "Pending",                // chờ chủ duyệt
        dueDate,
        transactionDate: liqDate,
      });
      await financialTicketDoc.save({ session });

    } else {
      // ── CẦN THU: Hóa đơn invoice_periodics ───────────────────────────
      settlementType = "collect";
      const amountToPay = Math.abs(totalSettlement); // số tiền tenant phải trả

      const items = [];
      if (liquidationType === "force_majeure") {
        // A < 0: tiền điện nước > hoàn cọc + hoàn thuê còn dư
        items.push({
          itemName: isDepositRefunded
            ? "Hoàn tiền cọc (Đã được hoàn từ trước)"
            : "Hoàn tiền cọc (100%)",
          usage: 1,
          unitPrice: depositRefundAmount,
          amount: depositRefundAmount,
          isIndex: false,
        });
        items.push({
          itemName: "Hoàn tiền thuê còn dư",
          usage: 1,
          unitPrice: remainingRentAmount,
          amount: remainingRentAmount,
          isIndex: false,
        });
        items.push({
          itemName: `Tiền ${electricService.name} cuối kỳ`,
          oldIndex: electricOldIndex,
          newIndex: Number(electricNewIndex),
          usage: electricUsage,
          unitPrice: electricUnitPrice,
          amount: electricCost,
          isIndex: true,
        });
        items.push({
          itemName: `Tiền ${waterService.name} cuối kỳ`,
          oldIndex: waterOldIndex,
          newIndex: Number(waterNewIndex),
          usage: waterUsage,
          unitPrice: waterUnitPrice,
          amount: waterCost,
          isIndex: true,
        });
      } else {
        // violation: cọc tịch thu, không hoàn thuê, chỉ thu điện nước
        items.push({
          itemName: "Tiền cọc bị tịch thu (vi phạm nội quy)",
          usage: 1,
          unitPrice: depositAmount,
          amount: 0, // ghi nhận nhưng không tính vào hóa đơn thu (đã giữ lại)
          isIndex: false,
        });
        items.push({
          itemName: `Tiền ${electricService.name} cuối kỳ`,
          oldIndex: electricOldIndex,
          newIndex: Number(electricNewIndex),
          usage: electricUsage,
          unitPrice: electricUnitPrice,
          amount: electricCost,
          isIndex: true,
        });
        items.push({
          itemName: `Tiền ${waterService.name} cuối kỳ`,
          oldIndex: waterOldIndex,
          newIndex: Number(waterNewIndex),
          usage: waterUsage,
          unitPrice: waterUnitPrice,
          amount: waterCost,
          isIndex: true,
        });
      }

      invoicePeriodicDoc = new InvoicePeriodic({
        invoiceCode,
        contractId: contract._id,
        title: `Hóa đơn tất toán - ${typeLabel} - ${room.name}`,
        items,
        totalAmount: amountToPay,
        status: "Unpaid",               // chờ kế toán xác nhận đã thu
        dueDate,
      });
      await invoicePeriodicDoc.save({ session });
    }

    // ── 7. Tạo bản ghi ContractLiquidation ───────────────────────────────
    const liquidation = new ContractLiquidation({
      contractId: contract._id,
      liquidationType,
      liquidationDate: liqDate,
      note,
      images,
      depositRefundAmount,
      remainingRentAmount: liquidationType === "force_majeure" ? remainingRentAmount : null,
      rentDebtAmount: null,
      totalSettlement,
      settlementType,
      // invoiceId:
      //   - refund  → lưu FinancialTicket._id (để financial_tickets.controller gốc
      //               query { invoiceId: id } vẫn tìm được và tự update status)
      //   - collect → lưu InvoicePeriodic._id
      invoiceId: financialTicketDoc ? financialTicketDoc._id : (invoicePeriodicDoc ? invoicePeriodicDoc._id : null),
      financialTicketId: financialTicketDoc ? financialTicketDoc._id : null,
      meterReadingIds: [mrElectric._id, mrWater._id],
      // Trạng thái ban đầu:
      //   refund  → pending_owner  (chờ chủ duyệt phiếu chi)
      //   collect → pending_accountant (chờ kế toán xác nhận đã thu hóa đơn)
      status: settlementType === "refund" ? "pending_owner" : "pending_accountant",
    });
    await liquidation.save({ session });

    // ── 8. Cập nhật deposit ─────────────────
    if (contract.depositId) {
      const deposit = await Deposit.findById(
        contract.depositId._id || contract.depositId
      ).session(session);
      if (deposit) {
        if (liquidationType === "force_majeure") {
          deposit.status = "Refunded";
          deposit.refundDate = liqDate;
        } else {
          deposit.status = "Forfeited";
          deposit.forfeitedDate = liqDate;
        }
        await deposit.save({ session });
      }
    }

    // Room giữ nguyên trạng thái Occupied trong khi liquidation đang chờ xử lý.
    // Room chỉ chuyển → Available khi liquidation.status = "completed"
    // (xử lý tại financial_tickets.controller.js khi phiếu chi/hóa đơn được xác nhận thanh toán)

    await session.commitTransaction();
    session.endSession();

    // ── 9. Gửi email thông báo cho tenant ────────────────────────────────
    try {
      let tenantEmail = contract.tenantId?.email;
      let tenantName = contract.tenantId?.username;

      if (!tenantEmail && contract.tenantId) {
        const tenantId = contract.tenantId._id || contract.tenantId;
        const tenant = await User.findById(tenantId).select("email username").lean();
        tenantEmail = tenant?.email || tenantEmail;
        tenantName = tenant?.username || tenantName;
      }

      if (tenantEmail && EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT) {
        // Dùng liquidationType để phân biệt thông báo vi phạm / bất khả kháng
        const emailType = liquidationType;
        await sendEmail(
          tenantEmail,
          EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT.subject,
          EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT.getHtml(
            tenantName || "Quý khách",
            room.name,
            typeLabel,
            liqDate.toLocaleDateString("vi-VN"),
            Math.abs(totalSettlement),
            emailType
          )
        );
      }
    } catch (e) {
      console.error("[LIQUIDATION] Email error:", e.message);
    }

    return res.status(201).json({
      success: true,
      message: `Thanh lý hợp đồng (${typeLabel}) thành công.`,
      data: {
        liquidation,
        settlementType,
        totalSettlement,
        ...(financialTicketDoc
          ? { financialTicket: financialTicketDoc }
          : { invoice: invoicePeriodicDoc }),
        meterReadings: [mrElectric, mrWater],
      },
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("[LIQUIDATION] Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi server khi xử lý thanh lý.",
    });
  }
};




// GET /liquidations/contract/:contractId
// ─────────────────────────────────────────────
exports.getLiquidationByContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    const liquidation = await ContractLiquidation.findOne({ contractId })
      .populate("contractId", "contractCode roomId tenantId startDate endDate")
      .populate("invoiceId", "status")
      .populate("financialTicketId", "status")
      .populate({
        path: "meterReadingIds",
        populate: { path: "utilityId", select: "name serviceName" },
      });

    if (!liquidation) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin thanh lý cho hợp đồng này.",
      });
    }

    await syncLiquidationCompletion(liquidation);
    res.status(200).json({ success: true, data: liquidation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// GET /liquidations/:id
// ─────────────────────────────────────────────
exports.getLiquidationById = async (req, res) => {
  try {
    const liquidation = await ContractLiquidation.findById(req.params.id)
      .populate({
        path: "contractId",
        select: "contractCode roomId tenantId startDate endDate",
        populate: [
          { path: "roomId", select: "name roomCode" },
          { path: "tenantId", select: "username email phoneNumber" },
        ],
      })
      .populate("invoiceId", "status")
      .populate("financialTicketId", "status")
      .populate({
        path: "meterReadingIds",
        populate: { path: "utilityId", select: "name serviceName" },
      });

    if (!liquidation) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy bản ghi thanh lý." });
    }

    await syncLiquidationCompletion(liquidation);
    res.status(200).json({ success: true, data: liquidation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// PATCH /liquidations/:id/status — Cập nhật trạng thái thanh lý
// ─────────────────────────────────────────────
exports.updateLiquidationStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!status || !["pending_owner", "pending_accountant", "completed"].includes(status)) {
      throw new Error("Trạng thái không hợp lệ.");
    }

    const liquidation = await ContractLiquidation.findById(id).session(session);
    if (!liquidation) throw new Error("Không tìm thấy bản ghi thanh lý.");

    liquidation.status = status;
    await liquidation.save({ session });

    if (status === "completed") {
      const contract = await Contract.findById(liquidation.contractId).session(session);
      if (contract && contract.status !== "terminated") {
        contract.status = "terminated";
        await contract.save({ session });
      }

      if (contract?.roomId) {
        const room = await Room.findById(contract.roomId).session(session);
        if (room) {
          const allRoomContracts = await Contract.find({ roomId: room._id })
            .select("_id")
            .session(session);
          const boundContractIds = new Set(allRoomContracts.map((c) => c._id.toString()));

          const floatingDeposits = await Deposit.find({ room: room._id, status: "Held" })
            .session(session);
          const hasFloatingDeposit = floatingDeposits.some((d) => {
            if (!d.contractId) return true;
            if (!boundContractIds.has(d.contractId.toString())) return true;
            return false;
          });

          room.status = hasFloatingDeposit ? "Deposited" : "Available";
          await room.save({ session });
        }
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái thanh lý thành công.",
      data: liquidation,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("[UPDATE_LIQUIDATION_STATUS] Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi server khi cập nhật trạng thái thanh lý.",
    });
  }
};

// ─────────────────────────────────────────────
// POST /liquidations/restore/:id — Hoàn tác thanh lý hợp đồng
// ─────────────────────────────────────────────
exports.restoreLiquidation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    const liquidation = await ContractLiquidation.findById(id)
      .populate({
        path: "contractId",
        populate: [
          { path: "roomId" },
          { path: "tenantId", select: "username email phoneNumber status" },
          { path: "depositId" },
        ],
      })
      .session(session);

    if (!liquidation) {
      throw new Error("Không tìm thấy bản ghi thanh lý.");
    }

    const contract = liquidation.contractId;
    if (!contract) {
      throw new Error("Không tìm thấy hợp đồng liên kết.");
    }

    // Cho phép hoàn tác nếu hợp đồng đang active (chưa kết thúc) hoặc terminated
    if (!["active", "terminated"].includes(contract.status)) {
      throw new Error(
        `Hợp đồng đang ở trạng thái "${contract.status}", không thể hoàn tác thanh lý.`
      );
    }

    const room = contract.roomId;

    // ── 1. Xóa FinancialTicket liên quan ──
    if (liquidation.invoiceId) {
      await mongoose.model("FinancialTicket").findByIdAndDelete(liquidation.invoiceId, { session });
    }

    // ── 2. Xóa MeterReading records ──
    if (liquidation.meterReadingIds && liquidation.meterReadingIds.length > 0) {
      await MeterReading.deleteMany({ _id: { $in: liquidation.meterReadingIds } }, { session });
    }

    // ── 3. Khôi phục trạng thái hợp đồng → active ──
    contract.status = "active";
    await contract.save({ session });

    // ── 4. Khôi phục trạng thái phòng → Occupied ──
    if (room) {
      await Room.findByIdAndUpdate(room._id, { status: "Occupied" }, { session });
    }

    // ── 5. Khôi phục trạng thái đặt cọc ──
    if (contract.depositId) {
      const deposit = await Deposit.findById(contract.depositId._id || contract.depositId).session(session);
      if (deposit) {
        if (liquidation.liquidationType === "force_majeure") {
          deposit.status = "Held";
          deposit.refundDate = null;
        } else {
          deposit.status = "Held";
          deposit.forfeitedDate = null;
        }
        await deposit.save({ session });
      }
    }

    // ── 6. Xóa bản ghi liquidation ──
    await ContractLiquidation.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    // Gửi email xin lỗi thông báo khôi phục hợp đồng
    try {
      const tenantEmail = contract.tenantId?.email;
      if (tenantEmail && EMAIL_TEMPLATES.LIQUIDATION_RESTORED) {
        const liqTypeLabel = liquidation.liquidationType === "force_majeure"
          ? "Bất khả kháng"
          : "Vi phạm hợp đồng";
        await sendEmail(
          tenantEmail,
          EMAIL_TEMPLATES.LIQUIDATION_RESTORED.subject,
          EMAIL_TEMPLATES.LIQUIDATION_RESTORED.getHtml(
            contract.tenantId?.username || "Quý khách",
            room?.name || "—",
            liqTypeLabel,
            liquidation.liquidationDate
              ? new Date(liquidation.liquidationDate).toLocaleDateString("vi-VN")
              : "—"
          )
        );
      }
    } catch (e) { console.error("[RESTORE_LIQUIDATION] Email error:", e.message); }

    res.status(200).json({
      success: true,
      message: "Đã hoàn tác thanh lý hợp đồng thành công. Hợp đồng đã được khôi phục về trạng thái Hoạt động.",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("[RESTORE_LIQUIDATION] Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi server khi hoàn tác thanh lý.",
    });
  }
};

// ─────────────────────────────────────────────
// GET /liquidations — Lấy tất cả liquidations
// ─────────────────────────────────────────────
exports.getAllLiquidations = async (req, res) => {
  try {
    const liquidations = await ContractLiquidation.find()
      .populate({
        path: "contractId",
        select: "contractCode roomId tenantId",
        populate: [
          { path: "roomId", select: "name" },
          { path: "tenantId", select: "username email" },
        ],
      })
      .populate("invoiceId", "status")
      .populate("financialTicketId", "status")
      .sort({ createdAt: -1 });

    for (const liquidation of liquidations) {
      // eslint-disable-next-line no-await-in-loop
      await syncLiquidationCompletion(liquidation);
    }

    res.status(200).json({
      success: true,
      count: liquidations.length,
      data: liquidations,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// GET /liquidations/preflight/:contractId?liquidationDate=YYYY-MM-DD
// Tính toán hoàn tiền thuê theo từng kỳ hóa đơn đã thanh toán
// ─────────────────────────────────────────────
exports.getPreflightData = async (req, res) => {
  try {
    const { contractId } = req.params;
    const msPerDay = 1000 * 60 * 60 * 24;

    // ── Ngày thanh lý (từ query param hoặc hôm nay) ──
    let liqDate = req.query.liquidationDate
      ? new Date(req.query.liquidationDate)
      : new Date();
    liqDate.setHours(12, 0, 0, 0);

    // ── Lấy hợp đồng ──
    const contract = await Contract.findById(contractId)
      .populate({ path: "roomId", populate: { path: "roomTypeId", select: "currentPrice typeName" } })
      .populate("depositId", "status amount refundDate forfeitedDate")
      .lean();

    if (!contract) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hợp đồng." });
    }

    // ── Lấy tất cả hóa đơn Paid, sắp xếp cũ → mới ──
    const paidInvoices = await InvoicePeriodic.find({ contractId, status: "Paid" })
      .sort({ createdAt: 1 })
      .lean();

    // ── Helper: parse "từ DD/MM/YYYY đến DD/MM/YYYY" từ itemName ──
    const parseVNDate = (str) => {
      const [d, m, y] = str.split("/").map(Number);
      const dt = new Date(y, m - 1, d, 12, 0, 0);
      return dt;
    };

    const parsePeriodFromText = (text) => {
      const match = text.match(/từ (\d{2}\/\d{2}\/\d{4}) đến (\d{2}\/\d{2}\/\d{4})/i);
      if (!match) return null;
      return { from: parseVNDate(match[1]), to: parseVNDate(match[2]), fromStr: match[1], toStr: match[2] };
    };

    // ── Duyệt từng hóa đơn → từng item tiền thuê → tính hoàn/không hoàn ──
    const paidRentPeriods = [];

    for (const invoice of paidInvoices) {
      for (const item of invoice.items) {
        const nameLC = item.itemName.toLowerCase();
        if (!nameLC.includes("tiền thuê") && !nameLC.includes("tiền phòng")) continue;
        if (item.amount <= 0) continue; // Bỏ qua dòng =0 (đã trả trước, không phát sinh)

        // ── Helper: Cố gắng parse ngày, nếu thất bại (VD: format cũ chỉ ghi "Tiền thuê phòng"), fallback tính theo số tháng ──
        let period = parsePeriodFromText(item.itemName);

        // Nếu không có ngày trong tex nhưng hóa đơn này là "PREPAID" hoặc "trả trước"
        if (!period &&
          (invoice.invoiceCode?.includes("PREPAID") || invoice.title?.toLowerCase().includes("trả trước") || item.usage > 1)) {
          // Fallback: dùng startDate của hợp đồng và usage để tính
          const isFirstDay = new Date(contract.startDate).getDate() === 1;
          let fromDt = new Date(contract.startDate);
          fromDt.setHours(12, 0, 0, 0);

          if (!isFirstDay) {
            fromDt = new Date(fromDt.getFullYear(), fromDt.getMonth() + 1, 1);
            fromDt.setHours(12, 0, 0, 0);
          }

          const toDt = new Date(fromDt.getFullYear(), fromDt.getMonth() + (item.usage >= 1 ? item.usage : 1), 0);
          toDt.setHours(12, 0, 0, 0);

          const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

          period = {
            from: fromDt,
            to: toDt,
            fromStr: fmt(fromDt),
            toStr: fmt(toDt)
          };
        }

        if (!period) {
          // Vẫn không có thông tin ngày → thử đoán kì này là 1 tháng tính từ dueDate
          const fromDt = new Date(invoice.dueDate || invoice.createdAt);
          fromDt.setHours(12, 0, 0, 0);
          const toDt = new Date(fromDt);
          toDt.setMonth(toDt.getMonth() + 1);
          toDt.setDate(toDt.getDate() - 1);
          toDt.setHours(12, 0, 0, 0);

          const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

          period = {
            from: fromDt,
            to: toDt,
            fromStr: fmt(fromDt),
            toStr: fmt(toDt)
          };
        }

        const { from, to, fromStr, toStr } = period;
        const totalDays = Math.round((to - from) / msPerDay) + 1;
        const dailyRate = totalDays > 0 ? item.amount / totalDays : 0;

        let usedDays = 0;
        let unusedDays = 0;
        let note = "";

        if (liqDate >= to) {
          // Khách đã ở hết giai đoạn này → không hoàn
          usedDays = totalDays;
          unusedDays = 0;
          note = "Đã sử dụng hết giai đoạn";
        } else if (liqDate < from) {
          // Ngày thanh lý trước ngày bắt đầu giai đoạn → hoàn toàn bộ
          usedDays = 0;
          unusedDays = totalDays;
          note = "Chưa sử dụng giai đoạn này";
        } else {
          // Liqdate trong giai đoạn: đã ở từ `from` đến `liqDate`, còn lại `liqDate+1` đến `to`
          usedDays = Math.round((liqDate - from) / msPerDay) + 1;
          unusedDays = totalDays - usedDays;
          note = `Đã ở ${usedDays} ngày, còn ${unusedDays} ngày chưa dùng`;
        }

        const refundAmount = Math.round(dailyRate * unusedDays);

        paidRentPeriods.push({
          invoiceTitle: invoice.title,
          itemName: item.itemName,
          fromStr,
          toStr,
          totalDays,
          dailyRate: Math.round(dailyRate),
          usedDays,
          unusedDays,
          itemAmount: Math.round(item.amount),
          refundAmount,
          note,
        });
      }
    }

    const totalRentRefund = paidRentPeriods.reduce((sum, p) => sum + p.refundAmount, 0);

    // ── Tính nợ tiền phòng (dành cho Vi phạm) ──
    const startDt = new Date(contract.startDate);
    startDt.setHours(12, 0, 0, 0);
    const endDt = new Date(liqDate);
    endDt.setHours(12, 0, 0, 0);
    const roomPrice = contract.roomId?.roomTypeId?.currentPrice || 0;
    const deposit = contract.depositId;

    let rentDebtDays = 0;
    if (endDt >= startDt) {
      for (let d = new Date(startDt); d <= endDt; d.setDate(d.getDate() + 1)) {
        const ts = d.getTime();
        let isPaid = false;

        // Cần parse lại từ fromStr/toStr do mảng paidRentPeriods không lưu object Date
        for (const p of paidRentPeriods) {
          const [fD, fM, fY] = p.fromStr.split("/");
          const [tD, tM, tY] = p.toStr.split("/");
          const fromDtLk = new Date(Number(fY), Number(fM) - 1, Number(fD), 12, 0, 0, 0);
          const toDtLk = new Date(Number(tY), Number(tM) - 1, Number(tD), 12, 0, 0, 0);

          if (ts >= fromDtLk.getTime() && ts <= toDtLk.getTime()) {
            isPaid = true;
            break;
          }
        }
        if (!isPaid) {
          rentDebtDays++;
        }
      }
    }
    const rentDebtAmount = rentDebtDays * Math.round(roomPrice / 30);

    // ── rentPaidUntil (dùng để hiển thị tham khảo) ──
    const rentPaidUntil = contract.rentPaidUntil ?? null;

    res.status(200).json({
      success: true,
      data: {
        contractId,
        contractCode: contract.contractCode,
        roomName: contract.roomId?.name,
        roomPrice,
        depositStatus: deposit ? deposit.status : "N/A",
        depositAmount: deposit ? deposit.amount : 0,
        endDate: contract.endDate ?? null,
        rentPaidUntil,
        totalPaidInvoices: paidInvoices.length,
        paidRentPeriods,
        totalRentRefund,
        rentDebtDays,
        rentDebtAmount,
        deposit: contract.depositId || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

