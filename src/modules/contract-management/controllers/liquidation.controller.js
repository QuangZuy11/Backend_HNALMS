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

// ─────────────────────────────────────────────
// POST /liquidations/create
// ─────────────────────────────────────────────
exports.createLiquidation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      contractId,
      liquidationType,         // 'force_majeure' | 'violation'
      liquidationDate,
      note,
      images,
      electricServiceId,       // ObjectId của Service điện
      waterServiceId,          // ObjectId của Service nước
      electricNewIndex,        // Số điện cuối
      waterNewIndex,           // Số nước cuối
    } = req.body;

    // ── 1. Validate contract ──────────────────
    const contract = await Contract.findById(contractId)
      .populate({ path: "roomId", populate: { path: "roomTypeId" } })
      .populate("tenantId", "email username phoneNumber status")
      .populate("depositId")
      .session(session);

    if (!contract) throw new Error("Không tìm thấy hợp đồng.");
    if (contract.status !== "active")
      throw new Error("Hợp đồng phải đang ở trạng thái active mới có thể thanh lý.");

    // ── 2. Xác định thông tin tài chính cơ bản ──
    const room = contract.roomId;
    const roomPrice = toNumber(room?.roomTypeId?.currentPrice);
    const liqDate = new Date(liquidationDate);
    liqDate.setHours(12, 0, 0, 0); // Normalize giữa ngày

    const msPerDay = 1000 * 60 * 60 * 24;

    // Số ngày đã ở trong tháng — dùng cho violation (rent_debt)
    const startOfMonth = new Date(liqDate.getFullYear(), liqDate.getMonth(), 1);
    const daysUsed = Math.round((liqDate - startOfMonth) / msPerDay) + 1;

    // ── 3. Tạo MeterReading records ──────────
    // Lấy oldIndex từ lần đọc mới nhất (sắp xếp readingDate DESC)
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

    // ── 4. Lấy đơn giá điện/nước thực tế từ bảng services ─────────────
    const electricService = await Service.findById(electricServiceId).session(session);
    const waterService = await Service.findById(waterServiceId).session(session);

    if (!electricService) throw new Error("Không tìm thấy dịch vụ điện trong hệ thống.");
    if (!waterService) throw new Error("Không tìm thấy dịch vụ nước trong hệ thống.");

    const electricUnitPrice = toNumber(electricService.currentPrice);
    const waterUnitPrice = toNumber(waterService.currentPrice);

    // Tiền điện/nước thực tế = số dùng × đơn giá (đây là khoản TRỪ với force_majeure, CỘNG với violation)
    const electricCost = electricUsage * electricUnitPrice;
    const waterCost = waterUsage * waterUnitPrice;
    const utilityCost = electricCost + waterCost;

    // ── 5. Tính toán tài chính theo loại ─────
    let depositRefundAmount = null;
    let remainingRentAmount = null;
    let rentDebtAmount = null;
    let totalSettlement = 0;

    // Lấy số tiền cọc từ linked deposit
    const isDepositRefunded = contract.depositId && contract.depositId.status === "Refunded";
    const depositAmount = contract.depositId
      ? toNumber(contract.depositId.amount)
      : 0;

    if (liquidationType === "force_majeure") {
      // Hoàn tiền cọc (Nếu đã hoàn rồi thì trả 0)
      depositRefundAmount = isDepositRefunded ? 0 : depositAmount;

      // ── Tính tiền thuê còn dư dựa trên ngày khách đã trả trước (rentPaidUntil) ──
      let remainingDays = 0;
      let remainingRentLabel = "";

      if (contract.rentPaidUntil) {
        const rpUntil = new Date(contract.rentPaidUntil);
        rpUntil.setHours(12, 0, 0, 0);
        if (rpUntil > liqDate) {
          remainingDays = Math.round((rpUntil - liqDate) / msPerDay);
          remainingRentLabel = `${remainingDays} ngày (đã trả trước đến ${rpUntil.toLocaleDateString("vi-VN")})`;
        } else {
          remainingRentLabel = `0 ngày (đã quá hạn trả trước: ${rpUntil.toLocaleDateString("vi-VN")})`;
        }
      } else if (contract.endDate) {
        // Fallback: nếu chưa ghi nhận hóa đơn trả trước, dùng endDate làm mốc tối đa
        const endDateObj = new Date(contract.endDate);
        endDateObj.setHours(12, 0, 0, 0);
        if (endDateObj > liqDate) {
          remainingDays = Math.round((endDateObj - liqDate) / msPerDay);
          remainingRentLabel = `${remainingDays} ngày (đến ${endDateObj.toLocaleDateString("vi-VN")})`;
        } else {
          remainingRentLabel = "0 ngày (hợp đồng đã hết hạn)";
        }
      } else {
        remainingRentLabel = "0 ngày";
      }

      remainingRentAmount = Math.round((roomPrice / 30) * remainingDays);

      // Tổng hoàn lại = tiền cọc + tiền thuê còn dư - tiền điện nước đã dùng
      totalSettlement = depositRefundAmount + remainingRentAmount - utilityCost;

      // ── 6a. Invoice items cho force_majeure ──
      const invoiceItems = [
        {
          itemName: isDepositRefunded ? "Hoàn tiền cọc (Đã được hoàn từ trước)" : "Hoàn tiền cọc (100%)",
          usage: 1,
          unitPrice: depositRefundAmount,
          amount: depositRefundAmount,
          isIndex: false,
        },
        {
          itemName: `Hoàn tiền thuê còn dư (${remainingRentLabel})`,
          usage: remainingDays,
          unitPrice: Math.round(roomPrice / 30),
          amount: remainingRentAmount,
          isIndex: false,
        },
        {
          // TRỪ tiền điện: số điện đã dùng phải trừ vào tiền hoàn
          itemName: `Trừ tiền ${electricService.name} cuối kỳ`,
          oldIndex: electricOldIndex,
          newIndex: Number(electricNewIndex),
          usage: electricUsage,
          unitPrice: electricUnitPrice,
          amount: -electricCost,   // ÂM: trừ vào tổng hoàn
          isIndex: true,
        },
        {
          // TRỪ tiền nước: số nước đã dùng phải trừ vào tiền hoàn
          itemName: `Trừ tiền ${waterService.name} cuối kỳ`,
          oldIndex: waterOldIndex,
          newIndex: Number(waterNewIndex),
          usage: waterUsage,
          unitPrice: waterUnitPrice,
          amount: -waterCost,      // ÂM: trừ vào tổng hoàn
          isIndex: true,
        },
      ];

      const typeLabel = "Bất khả kháng";
      const settlement = new FinancialTicket({
        invoiceCode: generateSettlementInvoiceCode(),
        contractId: contract._id,
        referenceId: contract._id,
        title: `Hóa đơn tất toán - ${typeLabel} - ${room.name}`,
        items: invoiceItems,
        totalAmount: totalSettlement,
        amount: Math.abs(totalSettlement),
        status: "Unpaid",
        dueDate: new Date(liqDate.getTime() + 3 * 24 * 60 * 60 * 1000),
      });
      await settlement.save({ session });

      const liquidation = new ContractLiquidation({
        contractId: contract._id,
        liquidationType,
        liquidationDate: liqDate,
        note,
        images,
        depositRefundAmount,
        remainingRentAmount,
        rentDebtAmount: null,
        totalSettlement,
        invoiceId: settlement._id,
        meterReadingIds: [mrElectric._id, mrWater._id],
      });
      await liquidation.save({ session });

      // Cập nhật các bảng liên quan
      contract.status = "terminated";
      await contract.save({ session });

      if (contract.depositId) {
        const deposit = await Deposit.findById(contract.depositId._id || contract.depositId).session(session);
        if (deposit) {
          deposit.status = "Refunded";
          deposit.refundDate = liqDate;
          await deposit.save({ session });
        }
      }

      // ── Kiểm tra floating deposit trước khi set trạng thái phòng ──
      // Nếu phòng đang có cọc lẻ (chưa bind contract) → giữ là Deposited
      const allRoomContracts = await Contract.find({
        roomId: room._id,
      }).select("_id").session(session);
      const boundContractIds = new Set(allRoomContracts.map((c) => c._id.toString()));

      const floatingDeposits = await Deposit.find({
        room: room._id,
        status: "Held",
      }).session(session);

      const hasFloatingDeposit = floatingDeposits.some((d) => {
        if (!d.contractId) return true; // chưa bind contract nào → floating
        if (!boundContractIds.has(d.contractId.toString())) return true; // bind contract đã bị thanh lý/xóa
        return false;
      });

      room.status = hasFloatingDeposit ? "Deposited" : "Available";
      await room.save({ session });
      // Removed: await User.findByIdAndUpdate(contract.tenantId._id || contract.tenantId, { status: "inactive" }, { session });

      await session.commitTransaction();
      session.endSession();

      // Email
      try {
        const tenantEmail = contract.tenantId?.email;
        if (tenantEmail && EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT) {
          await sendEmail(
            tenantEmail,
            EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT.subject,
            EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT.getHtml(
              contract.tenantId?.username || "Quý khách",
              room.name, typeLabel,
              liqDate.toLocaleDateString("vi-VN"),
              totalSettlement, liquidationType
            )
          );
        }
      } catch (e) { console.error("[LIQUIDATION] Email error:", e.message); }

      return res.status(201).json({
        success: true,
        message: "Thanh lý hợp đồng (Bất khả kháng) thành công.",
        data: { liquidation, invoice: settlement, totalSettlement, meterReadings: [mrElectric, mrWater] },
      });

    } else {
      // ── violation: tịch thu tiền cọc, thu tiền thuê nợ + tiền điện nước ──
      rentDebtAmount = Math.round((roomPrice / 30) * daysUsed);
      // Tổng = tiền thuê còn nợ + tiền điện nước (CỘNG vào vì tenant phải trả)
      totalSettlement = rentDebtAmount + utilityCost;

      const invoiceItems = [
        {
          itemName: `Tiền thuê còn nợ (${daysUsed} ngày trong tháng)`,
          usage: daysUsed,
          unitPrice: Math.round(roomPrice / 30),
          amount: rentDebtAmount,
          isIndex: false,
        },
        {
          // Cộng tiền điện: tenant nợ khoản này
          itemName: `Tiền ${electricService.name} cuối kỳ`,
          oldIndex: electricOldIndex,
          newIndex: Number(electricNewIndex),
          usage: electricUsage,
          unitPrice: electricUnitPrice,
          amount: electricCost,   // DƯƠNG: tenant phải trả
          isIndex: true,
        },
        {
          // Cộng tiền nước: tenant nợ khoản này
          itemName: `Tiền ${waterService.name} cuối kỳ`,
          oldIndex: waterOldIndex,
          newIndex: Number(waterNewIndex),
          usage: waterUsage,
          unitPrice: waterUnitPrice,
          amount: waterCost,      // DƯƠNG: tenant phải trả
          isIndex: true,
        },
        {
          itemName: "Tiền cọc bị tịch thu (vi phạm nội quy)",
          usage: 1,
          unitPrice: depositAmount,
          amount: 0, // Ghi nhận nhưng = 0 vì đã bị giữ lại, không tính vào hóa đơn thu thêm
          isIndex: false,
        },
      ];

      const typeLabel = "Vi phạm hợp đồng";
      const settlement = new FinancialTicket({
        invoiceCode: generateSettlementInvoiceCode(),
        contractId: contract._id,
        referenceId: contract._id,
        title: `Hóa đơn tất toán - ${typeLabel} - ${room.name}`,
        items: invoiceItems,
        totalAmount: totalSettlement,
        amount: Math.abs(totalSettlement),
        status: "Unpaid",
        dueDate: new Date(liqDate.getTime() + 3 * 24 * 60 * 60 * 1000),
      });
      await settlement.save({ session });

      const liquidation = new ContractLiquidation({
        contractId: contract._id,
        liquidationType,
        liquidationDate: liqDate,
        note,
        images,
        depositRefundAmount: null,
        remainingRentAmount: null,
        rentDebtAmount,
        totalSettlement,
        invoiceId: settlement._id,
        meterReadingIds: [mrElectric._id, mrWater._id],
      });
      await liquidation.save({ session });

      contract.status = "terminated";
      await contract.save({ session });

      if (contract.depositId) {
        const deposit = await Deposit.findById(contract.depositId._id || contract.depositId).session(session);
        if (deposit) {
          deposit.status = "Forfeited";
          deposit.forfeitedDate = liqDate;
          await deposit.save({ session });
        }
      }

      // ── Kiểm tra floating deposit trước khi set trạng thái phòng ──
      // Nếu phòng đang có cọc lẻ (chưa bind contract) → giữ là Deposited
      const allRoomContracts = await Contract.find({
        roomId: room._id,
      }).select("_id").session(session);
      const boundContractIds = new Set(allRoomContracts.map((c) => c._id.toString()));

      const floatingDeposits = await Deposit.find({
        room: room._id,
        status: "Held",
      }).session(session);

      const hasFloatingDeposit = floatingDeposits.some((d) => {
        if (!d.contractId) return true;
        if (!boundContractIds.has(d.contractId.toString())) return true;
        return false;
      });

      room.status = hasFloatingDeposit ? "Deposited" : "Available";
      await room.save({ session });
      // Removed: await User.findByIdAndUpdate(contract.tenantId._id || contract.tenantId, { status: "inactive" }, { session });

      await session.commitTransaction();
      session.endSession();

      try {
        const tenantEmail = contract.tenantId?.email;
        if (tenantEmail && EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT) {
          await sendEmail(
            tenantEmail,
            EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT.subject,
            EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT.getHtml(
              contract.tenantId?.username || "Quý khách",
              room.name, typeLabel,
              liqDate.toLocaleDateString("vi-VN"),
              totalSettlement, liquidationType
            )
          );
        }
      } catch (e) { console.error("[LIQUIDATION] Email error:", e.message); }

      return res.status(201).json({
        success: true,
        message: "Thanh lý hợp đồng (Vi phạm) thành công.",
        data: { liquidation, invoice: settlement, totalSettlement, meterReadings: [mrElectric, mrWater] },
      });
    }
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

// ─────────────────────────────────────────────
// GET /liquidations/contract/:contractId
// ─────────────────────────────────────────────
exports.getLiquidationByContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    const liquidation = await ContractLiquidation.findOne({ contractId })
      .populate("contractId", "contractCode roomId tenantId startDate endDate")
      .populate("invoiceId")
      .populate("meterReadingIds");

    if (!liquidation) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin thanh lý cho hợp đồng này.",
      });
    }

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
      .populate("invoiceId")
      .populate("meterReadingIds");

    if (!liquidation) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy bản ghi thanh lý." });
    }

    res.status(200).json({ success: true, data: liquidation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    // Chỉ cho phép hoàn tác nếu hợp đồng đang ở trạng thái terminated
    if (contract.status !== "terminated") {
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
      .sort({ createdAt: -1 });

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

          const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
          
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
          
          const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
          
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
          const fromDtLk = new Date(Number(fY), Number(fM)-1, Number(fD), 12, 0, 0, 0);
          const toDtLk = new Date(Number(tY), Number(tM)-1, Number(tD), 12, 0, 0, 0);
          
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

