const mongoose = require("mongoose");
const Contract = require("../models/contract.model");
const ContractLiquidation = require("../models/contract_liquidation.model");
const Deposit = require("../models/deposit.model");
const Room = require("../../room-floor-management/models/room.model");
const User = require("../../authentication/models/user.model");
const MeterReading = require("../../invoice-management/models/meterreading.model");
const InvoicePeriodic = require("../../invoice-management/models/invoice_periodic.model");
const Service = require("../../service-management/models/service.model");
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
    const depositAmount = contract.depositId
      ? toNumber(contract.depositId.amount)
      : 0;

    if (liquidationType === "force_majeure") {
      // Hoàn 100% tiền cọc
      depositRefundAmount = depositAmount;

      // ── Tính tiền thuê còn dư: từ ngày thanh lý đến endDate của hợp đồng ──
      let remainingDays = 0;
      let remainingRentLabel = "";
      if (contract.endDate) {
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
          itemName: "Hoàn tiền cọc (100%)",
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
      const settlement = new InvoicePeriodic({
        invoiceCode: generateSettlementInvoiceCode(),
        contractId: contract._id,
        title: `Hóa đơn tất toán - ${typeLabel} - ${room.name}`,
        items: invoiceItems,
        totalAmount: totalSettlement,
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
      await Room.findByIdAndUpdate(room._id, { status: "Available" }, { session });
      await User.findByIdAndUpdate(contract.tenantId._id || contract.tenantId, { status: "inactive" }, { session });

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

      const typeLabel = "Vi phạm";
      const settlement = new InvoicePeriodic({
        invoiceCode: generateSettlementInvoiceCode(),
        contractId: contract._id,
        title: `Hóa đơn tất toán - ${typeLabel} - ${room.name}`,
        items: invoiceItems,
        totalAmount: totalSettlement,
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
      await Room.findByIdAndUpdate(room._id, { status: "Available" }, { session });
      await User.findByIdAndUpdate(contract.tenantId._id || contract.tenantId, { status: "inactive" }, { session });

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
