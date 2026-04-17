const MoveOutRequest = require("../models/moveout_request.model");
const Contract = require("../models/contract.model");
const Deposit = require("../models/deposit.model");
const InvoicePeriodic = require("../../invoice-management/models/invoice_periodic.model");
const Payment = require("../../invoice-management/models/payment.model");
const MeterReading = require("../../invoice-management/models/meterreading.model");
const BookService = require("../../contract-management/models/bookservice.model");
const Room = require("../../room-floor-management/models/room.model");
const Invoice = require("../../invoice-management/models/invoice.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
const Notification = require("../../notification-management/models/notification.model");
const Service = require("../../service-management/models/service.model");
const FinancialTicket = require("../../managing-income-expenses/models/financial_tickets");

const MOVEOUT_POLICY = {
  MIN_NOTICE_DAYS: 30,
  MIN_STAY_MONTHS: 6,
  /** Ngày tối thiểu giữa endDate (gap) và startDate HĐ kế để coi là "lấp khe" trước HĐ tương lai — tránh nhầm thuê nối tiếp sát ngày */
  MIN_GAP_DAYS_AFTER_CONTRACT_END: 7
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

class MoveOutRequestService {
  _parseDateInput(dateInput) {
    if (dateInput instanceof Date) {
      return new Date(dateInput.getTime());
    }

    if (typeof dateInput === 'number') {
      return new Date(dateInput);
    }

    if (typeof dateInput === 'string') {
      const raw = dateInput.trim();

      // Support dd/MM/yyyy and dd-MM-yyyy from frontend forms.
      const dayFirst = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dayFirst) {
        const day = Number(dayFirst[1]);
        const month = Number(dayFirst[2]);
        const year = Number(dayFirst[3]);
        const parsed = new Date(year, month - 1, day);
        if (
          parsed.getFullYear() === year &&
          parsed.getMonth() === month - 1 &&
          parsed.getDate() === day
        ) {
          return parsed;
        }
        return new Date(NaN);
      }

      // Support yyyy-MM-dd and yyyy/MM/dd.
      const yearFirst = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (yearFirst) {
        const year = Number(yearFirst[1]);
        const month = Number(yearFirst[2]);
        const day = Number(yearFirst[3]);
        const parsed = new Date(year, month - 1, day);
        if (
          parsed.getFullYear() === year &&
          parsed.getMonth() === month - 1 &&
          parsed.getDate() === day
        ) {
          return parsed;
        }
        return new Date(NaN);
      }

      return new Date(raw);
    }

    return new Date(dateInput);
  }

  _toDateOnly(dateInput) {
    const d = this._parseDateInput(dateInput);
    if (Number.isNaN(d.getTime())) {
      return new Date(NaN);
    }

    // Normalize to calendar day in VN timezone to avoid timezone drift.
    // Use Intl.DateTimeFormat with VN timezone to extract the correct calendar date,
    // then store as UTC midnight (00:00:00 UTC) so date boundary crossing is impossible
    // regardless of timezone offsets during comparisons.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: VN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);

    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);

    if (!year || !month || !day) {
      return new Date(NaN);
    }

    // UTC midnight — consistent across all date comparisons in the service.
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }

  _formatVNDate(dateInput) {
    const d = this._toDateOnly(dateInput);
    if (Number.isNaN(d.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: VN_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);
  }

  _getCalendarDaysDiff(fromDateInput, toDateInput) {
    const from = this._toDateOnly(fromDateInput);
    const to = this._toDateOnly(toDateInput);
    return Math.floor((to - from) / DAY_IN_MS);
  }

  _getCompletedMonths(startDateInput, endDateInput) {
    const start = this._toDateOnly(startDateInput);
    const end = this._toDateOnly(endDateInput);

    let months = (end.getFullYear() - start.getFullYear()) * 12;
    months += end.getMonth() - start.getMonth();

    if (end.getDate() < start.getDate()) {
      months -= 1;
    }

    return Math.max(months, 0);
  }

  // ============================================================
  //  HELPER – Kiểm tra gap contract
  // ============================================================
  /**
   * Kiểm tra gap contract theo nghiệp vụ:
   * - Type 1: startDate sau hợp đồng khác có startDate sớm nhất trên phòng (gap sau “chuỗi” sớm).
   * Gap = HĐ bắt đầu SAU Primary. Primary = HĐ startDate sớm nhất trên phòng.
   * (người lấp khoảng trống trước HĐ tương lai — ví dụ B 4–9 trước A 10).
   *
   * @param {Object} contract - Contract document
   * @returns {Object} { isGapContract, primaryContract }
   */
  async _checkIfGapContract(contract) {
    if (!contract?.roomId) {
      return { isGapContract: false, primaryContract: null };
    }

    const allContracts = await Contract.find({
      roomId: contract.roomId,
      status: { $in: ["active", "inactive"] }
    })
      .select("_id startDate endDate tenantId status")
      .lean();

    if (allContracts.length <= 1) {
      return { isGapContract: false, primaryContract: null };
    }

    // 1. Tìm Primary Contract = HĐ có startDate MUỘN NHẤT
    let primaryContract = allContracts[0];
    for (const c of allContracts) {
      if (this._toDateOnly(c.startDate) > this._toDateOnly(primaryContract.startDate)) {
        primaryContract = c;
      }
    }

    // 2. Gap Contract = HĐ có endDate ≤ startDate của Primary (thuê trong khoảng trống trước primary)
    const myEnd = this._toDateOnly(contract.endDate);
    const primaryStart = this._toDateOnly(primaryContract.startDate);
    const isGapContract = myEnd <= primaryStart;

    return { isGapContract, primaryContract };
  }

  /**
   * Xử lý room status sau khi gap contract trả phòng.
   *
   * Luồng xử lý:
   * 1. Tìm tất cả gap contracts còn lại trong phòng
   * 2. Tìm gap contract kết thúc MUỘN NHẤT
   * 3. So sánh với ngày vào ở của primary contract
   * 4. Cập nhật room status phù hợp
   */
  async _handleRoomStatusAfterGapMoveOut(contract) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Tìm primary contract
    const { isGapContract, primaryContract } = await this._checkIfGapContract(contract);

    // Nếu không phải gap contract → dùng logic cũ (không thay đổi room status)
    if (!isGapContract || !primaryContract) {
      console.log(`[MOVEOUT] Primary contract hoặc không có gap → giữ nguyên room status`);
      return;
    }

    // 2. Tìm tất cả gap contracts còn lại (chưa terminated/expired)
    const remainingGapContracts = await Contract.find({
      roomId: contract.roomId,
      _id: { $ne: contract._id },
      status: { $in: ["active", "inactive"] },
      startDate: { $gt: new Date(primaryContract.startDate) } // Chỉ gap contracts
    }).sort({ endDate: -1 });

    // 3. Tìm ngày kết thúc muộn nhất trong các gap contracts còn lại
    let latestEndDate = null;
    if (remainingGapContracts.length > 0) {
      latestEndDate = new Date(remainingGapContracts[0].endDate);
    }

    // 4. Xác định room status
    const primaryStartDate = new Date(primaryContract.startDate);
    const room = await Room.findById(contract.roomId);

    if (!room) return;

    // Nếu primary contract đã vào ở (startDate <= today) → Room Occupied
    if (primaryStartDate <= today) {
      // Primary đã vào ở → Phòng phải là Occupied
      if (room.status !== "Occupied") {
        room.status = "Occupied";
        await room.save();
        console.log(`[MOVEOUT] Primary đã vào ở → Room ${room.name}: Occupied`);
      }
    } else {
      // Primary chưa vào ở → Kiểm tra gap contracts còn lại
      // Còn gap contract nào đang ở (startDate <= today < endDate)?
      const activeGapContract = await Contract.findOne({
        roomId: contract.roomId,
        _id: { $ne: contract._id },
        status: "active",
        startDate: { $lte: today },
        endDate: { $gt: today }
      });

      if (activeGapContract) {
        // Có người đang ở → Room Occupied
        if (room.status !== "Occupied") {
          room.status = "Occupied";
          await room.save();
          console.log(`[MOVEOUT] Có người đang ở → Room ${room.name}: Occupied`);
        }
      } else {
        // Không còn ai đang ở → Room Deposited (chờ primary hoặc gap tiếp theo)
        if (room.status !== "Deposited") {
          room.status = "Deposited";
          await room.save();
          console.log(`[MOVEOUT] Không còn ai đang ở → Room ${room.name}: Deposited`);
        }
      }
    }
  }

  async _findDepositForContract(contract) {
    if (!contract) {
      return null;
    }

    // Ưu tiên lấy theo depositId đã liên kết với hợp đồng.
    if (contract.depositId) {
      const byId = await Deposit.findById(contract.depositId).select("_id amount status room createdAt");
      if (byId) {
        return byId;
      }
    }

    // Fallback cho dữ liệu cũ chưa gắn depositId vào contract.
    if (contract.roomId) {
      const preferredStatuses = ["Held", "Refunded", "Forfeited", "Pending"];
      const byRoom = await Deposit.findOne({
        room: contract.roomId,
        status: { $in: preferredStatuses }
      })
        .select("_id amount status room createdAt")
        .sort({ createdAt: -1 });

      if (byRoom) {
        return byRoom;
      }

      const anyByRoom = await Deposit.findOne({ room: contract.roomId })
        .select("_id amount status room createdAt")
        .sort({ createdAt: -1 });

      if (anyByRoom) {
        return anyByRoom;
      }
    }

    return null;
  }

  /**
   * Tính số tiền phòng trả trước dư khi trả phòng sớm.
   * Ví dụ: HĐ endDate = 30/06, rentPaidUntil = 30/04 → đã trả trước 2 tháng → dư
   * Công thức: (rentPaidUntil - endDate) × (giá phòng / 30)
   *
   * @param {Object} contract - Contract document (đã populate roomId.roomTypeId)
   * @param {Date|string} moveOutDate - Ngày trả phòng thực tế
   * @returns {number} Số tiền prepaid dư (>= 0)
   */
  _calculatePrepaidRentOverpay(contract, moveOutDate) {
    if (!contract || !moveOutDate) return 0;

    const endDate = this._toDateOnly(contract.endDate);
    const rentPaidUntil = contract.rentPaidUntil ? this._toDateOnly(contract.rentPaidUntil) : null;

    // Không có prepaid → không có dư
    if (!rentPaidUntil) return 0;

    // rentPaidUntil <= endDate → không dư (đã trả đến đúng/hết hạn)
    if (rentPaidUntil <= endDate) return 0;

    // Tính số ngày dư: rentPaidUntil - endDate
    const daysOverpay = Math.max(0, Math.floor((rentPaidUntil - endDate) / DAY_IN_MS));

    // Lấy giá phòng từ roomTypeId (nằm trên room, không phải contract)
    let roomPrice = 0;
    if (contract.roomId?.roomTypeId) {
      const priceRaw = contract.roomId.roomTypeId.currentPrice;
      if (priceRaw) {
        roomPrice = typeof priceRaw === 'object' && priceRaw.$numberDecimal
          ? parseFloat(priceRaw.$numberDecimal)
          : Number(priceRaw) || 0;
      }
    }

    if (roomPrice <= 0) return 0;

    // Tiền dư = số ngày dư × (giá phòng / 30)
    const overpayAmount = daysOverpay * (roomPrice / 30);
    return Math.max(0, Math.round(overpayAmount));
  }

  /**
   * Tính số tháng và số tiền phòng trả trước cần hoàn lại khi trả phòng.
   * Rule: Bỏ qua tháng hiện tại, chỉ tính từ tháng tiếp theo đến rentPaidUntil (inclusive).
   * Ví dụ: today = 14/04/2026, rentPaidUntil = 30/06/2026 → tính tháng 5 + 6 = 2 tháng.
   * Số tiền lấy từ InvoicePeriodic có title “Thanh toán tiền phòng trả trước” và dueDate ở tháng tiếp theo trở đi.
   *
   * @param {Object} contract - Contract document (đã populate roomId.roomTypeId)
   * @returns {Promise<{ months: number, amount: number }>}
   */
  async _calculatePrepaidMonthsAndAmount(contract) {
    const rentPaidUntil = contract.rentPaidUntil;
    if (!rentPaidUntil) return { months: 0, amount: 0 };

    const paidUntil = this._toDateOnly(rentPaidUntil);
    const now = new Date();

    // Đầu tháng tiếp theo (UTC midnight)
    const nextMonthStart = this._toDateOnly(new Date(now.getFullYear(), now.getMonth() + 1, 1));

    // rentPaidUntil phải vươn sang tháng tiếp theo mới có tiền hoàn
    if (paidUntil < nextMonthStart) return { months: 0, amount: 0 };

    // Đếm số tháng từ nextMonthStart đến tháng của rentPaidUntil (inclusive)
    const startYear = nextMonthStart.getUTCFullYear();
    const startMonth = nextMonthStart.getUTCMonth(); // 0-indexed
    const endYear = paidUntil.getUTCFullYear();
    const endMonth = paidUntil.getUTCMonth();      // 0-indexed
    const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    if (months <= 0) return { months: 0, amount: 0 };

    // Tìm hóa đơn trả trước trong InvoicePeriodic (Paid, dueDate ở tháng tiếp theo trở đi)
    const prepaidInvoice = await InvoicePeriodic.findOne({
      contractId: contract._id,
      title: { $regex: /Thanh toán tiền phòng trả trước/i },
      status: 'Paid',
      dueDate: { $gte: nextMonthStart }
    }).sort({ dueDate: -1 }).lean();

    let amount = 0;
    if (prepaidInvoice) {
      // Trích số tháng từ title, VD: “Thanh toán tiền phòng trả trước (2 tháng)”
      const match = (prepaidInvoice.title || '').match(/(\((\d+)\s*tháng\))/i);
      const totalMonthsPaid = match ? parseInt(match[2], 10) : 1;
      const perMonthAmount = (Number(prepaidInvoice.totalAmount) || 0) / totalMonthsPaid;
      amount = Math.round(perMonthAmount * months);
      console.log(`[MOVEOUT] 📅 Prepaid invoice: "${prepaidInvoice.title}" | ${totalMonthsPaid} tháng đã trả | hoàn ${months} tháng × ${perMonthAmount.toLocaleString('vi-VN')} = ${amount.toLocaleString('vi-VN')} VND`);
    } else {
      // Fallback: dùng giá phòng từ roomTypeId nếu không tìm thấy invoice
      let roomPrice = 0;
      if (contract.roomId?.roomTypeId) {
        const priceRaw = contract.roomId.roomTypeId.currentPrice;
        if (priceRaw) {
          roomPrice = typeof priceRaw === 'object' && priceRaw.$numberDecimal
            ? parseFloat(priceRaw.$numberDecimal)
            : Number(priceRaw) || 0;
        }
      }
      amount = Math.round(roomPrice * months);
      console.log(`[MOVEOUT] 📅 Prepaid fallback (no invoice): ${months} tháng × ${roomPrice.toLocaleString('vi-VN')} = ${amount.toLocaleString('vi-VN')} VND`);
    }

    return { months, amount };
  }

  _buildTodayPaymentVoucherPrefix() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    return `PAY-${dd}${mm}${yyyy}-`;
  }

  async _getNextMoveOutRefundVoucher() {
    const prefix = this._buildTodayPaymentVoucherPrefix();

    const latest = await FinancialTicket.findOne({
      paymentVoucher: { $regex: `^${prefix}\\d{4}$` }
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
      if (!exists) {
        return candidate;
      }

      nextNumber += 1;
    }

    throw new Error("Không thể tạo mã phiếu chi mới, vui lòng thử lại");
  }

  async syncDepositStatusByRefundTicket(ticket, nextTicketStatus) {
    if (!ticket?.referenceId) {
      return;
    }

    const title = String(ticket.title || "").trim();
    if (!/^Hoàn cọc trả phòng/i.test(title)) {
      return;
    }

    const moveOutRequest = await MoveOutRequest.findById(ticket.referenceId)
      .select("_id contractId isDepositForfeited status paymentDate")
      .lean();
    if (!moveOutRequest?.contractId) {
      return;
    }

    const contract = await Contract.findById(moveOutRequest.contractId)
      .select("depositId roomId")
      .lean();
    if (!contract) {
      return;
    }

    if (nextTicketStatus === "Paid") {
      const updates = {};
      const canTransitionToPaid = ["Requested", "InvoiceReleased"].includes(moveOutRequest.status);

      if (canTransitionToPaid) {
        updates.status = "Paid";
      }
      if (!moveOutRequest.paymentDate && (canTransitionToPaid || moveOutRequest.status === "Paid")) {
        updates.paymentDate = new Date();
      }

      if (Object.keys(updates).length > 0) {
        await MoveOutRequest.findByIdAndUpdate(moveOutRequest._id, updates);
      }

      if (moveOutRequest.isDepositForfeited) {
        const deposit = await this._findDepositForContract(contract);
        if (deposit?._id) {
          await Deposit.findByIdAndUpdate(deposit._id, {
            status: "Forfeited",
            refundDate: null,
            forfeitedDate: new Date(),
          });
        }
      }
    }
  }

  async syncMoveOutByFinalInvoicePaid(finalInvoiceId) {
    if (!finalInvoiceId) {
      return null;
    }

    // Lấy đủ các field cần cho việc tạo phiếu chi
    const moveOutRequest = await MoveOutRequest.findOne({ finalInvoiceId })
      .select("_id contractId status isDepositForfeited depositRefundAmount prepaidRentOverpay prepaidMonths");
    if (!moveOutRequest) {
      console.warn(`[MOVEOUT] ⚠️ Không tìm thấy move-out liên kết với finalInvoiceId: ${finalInvoiceId}`);
      return null;
    }

    const canTransitionToPaid = ["Requested", "InvoiceReleased"].includes(moveOutRequest.status);
    if (!canTransitionToPaid && moveOutRequest.status !== "Paid") {
      return {
        moveOutRequestId: moveOutRequest._id,
        status: moveOutRequest.status,
        isDepositForfeited: moveOutRequest.isDepositForfeited,
      };
    }

    // ─── Chuyển status → Paid ─────────────────────────────────────────
    if (canTransitionToPaid) {
      await MoveOutRequest.findByIdAndUpdate(moveOutRequest._id, { status: "Paid" });
      console.log(`[MOVEOUT] ✅ Chuyển trạng thái sang Paid: ${moveOutRequest._id}`);
    }

    // ─── Lấy thông tin hợp đồng + cọc ──────────────────────────────────
    const contract = await Contract.findById(moveOutRequest.contractId)
      .select("_id contractCode depositId roomId")
      .lean();

    const isDepositForfeited = Boolean(moveOutRequest.isDepositForfeited);
    const prepaidAmt = Math.max(Number(moveOutRequest.prepaidRentOverpay) || 0, 0);
    const prepaidMths = Number(moveOutRequest.prepaidMonths) || 0;
    const totalRefund = Math.max(Number(moveOutRequest.depositRefundAmount) || 0, 0);
    const contractCode = contract?.contractCode || String(moveOutRequest.contractId);

    let depositAmt = 0;
    if (contract) {
      const deposit = await this._findDepositForContract(contract);
      depositAmt = deposit ? Math.max(Number(deposit.amount) || 0, 0) : 0;
    }

    // ─── Tạo phiếu chi theo 3 trường hợp (chỉ tạo 1 lần khi chuyển Paid) ──────
    // Case 1: Không mất cọc → gộp cọc + prepaid dư vào 1 phiếu chi
    // Case 2: Mất cọc nhưng còn tiền phòng trả trước → phiếu chi hoàn prepaid riêng
    // Case 3: Mất cọc và không có tiền phòng trả trước → không tạo phiếu chi
    if (!isDepositForfeited && totalRefund > 0) {
      // Case 1
      const existingTicket = await FinancialTicket.findOne({
        referenceId: moveOutRequest._id,
        title: { $regex: /^Hoàn tiền trả phòng/i }
      }).select("_id").lean();

      if (!existingTicket) {
        const paymentVoucher = await this._getNextMoveOutRefundVoucher();
        let ticketTitle = `Hoàn tiền trả phòng - HĐ ${contractCode}`;
        if (depositAmt > 0 && prepaidAmt > 0) {
          ticketTitle += ` (Cọc ${depositAmt.toLocaleString('vi-VN')} + Trả trước ${prepaidMths} tháng ${prepaidAmt.toLocaleString('vi-VN')})`;
        } else if (prepaidAmt > 0) {
          ticketTitle += ` (Tiền trả trước ${prepaidMths} tháng ${prepaidAmt.toLocaleString('vi-VN')})`;
        }
        await FinancialTicket.create({
          amount: totalRefund,
          title: ticketTitle,
          referenceId: moveOutRequest._id,
          status: "Approved",
          transactionDate: new Date(),
          accountantPaidAt: null,
          paymentVoucher,
        });
        console.log(`[MOVEOUT] ✅ Case 1 - Phiếu chi hoàn tiền (Paid): ${ticketTitle} | ${totalRefund.toLocaleString('vi-VN')} VND`);
      }
    } else if (isDepositForfeited && prepaidAmt > 0) {
      // Case 2
      const existingTicket = await FinancialTicket.findOne({
        referenceId: moveOutRequest._id,
        title: { $regex: /^Hoàn tiền phòng trả trước/i }
      }).select("_id").lean();

      if (!existingTicket) {
        const paymentVoucher = await this._getNextMoveOutRefundVoucher();
        const ticketTitle = `Hoàn tiền phòng trả trước - HĐ ${contractCode} (${prepaidMths} tháng)`;
        await FinancialTicket.create({
          amount: prepaidAmt,
          title: ticketTitle,
          referenceId: moveOutRequest._id,
          status: "Approved",
          transactionDate: new Date(),
          accountantPaidAt: null,
          paymentVoucher,
        });
        console.log(`[MOVEOUT] ✅ Case 2 - Phiếu chi hoàn tiền trả trước (Paid): ${ticketTitle} | ${prepaidAmt.toLocaleString('vi-VN')} VND`);
      }
    }
    // Case 3: isDepositForfeited && prepaidAmt === 0 → không tạo phiếu chi

    return {
      moveOutRequestId: moveOutRequest._id,
      status: "Paid",
      isDepositForfeited,
    };
  }

  async _syncMoveOutByRequestId(moveOutRequestId) {
    if (!moveOutRequestId) {
      return null;
    }

    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId)
      .select("_id finalInvoiceId status");
    if (!moveOutRequest?.finalInvoiceId) {
      const paidRefundTicket = await FinancialTicket.findOne({
        referenceId: moveOutRequestId,
        status: "Paid",
        title: { $in: [/^Hoàn cọc trả phòng/i, /^Hoàn tiền trả phòng/i] }
      })
        .select("_id referenceId title status")
        .sort({ createdAt: -1 })
        .lean();

      if (!paidRefundTicket) {
        return moveOutRequest;
      }

      await this.syncDepositStatusByRefundTicket(paidRefundTicket, "Paid");
      return await MoveOutRequest.findById(moveOutRequestId);
    }

    const finalInvoice = await InvoicePeriodic.findById(moveOutRequest.finalInvoiceId)
      .select("_id status")
      .lean();

    if (finalInvoice?.status !== "Paid") {
      return moveOutRequest;
    }

    await this.syncMoveOutByFinalInvoicePaid(finalInvoice._id);
    return await MoveOutRequest.findById(moveOutRequestId);
  }

  async _syncPendingMoveOutsWithPaidInvoices() {
    const candidates = await MoveOutRequest.find({
      status: { $in: ["Requested", "InvoiceReleased"] },
      finalInvoiceId: { $ne: null },
    })
      .select("finalInvoiceId")
      .lean();

    if (candidates.length === 0) {
      return 0;
    }

    const invoiceIds = [
      ...new Set(
        candidates
          .map((item) => item.finalInvoiceId && String(item.finalInvoiceId))
          .filter(Boolean)
      )
    ];

    if (invoiceIds.length === 0) {
      return 0;
    }

    const paidInvoices = await InvoicePeriodic.find({
      _id: { $in: invoiceIds },
      status: "Paid",
    })
      .select("_id")
      .lean();

    if (paidInvoices.length === 0) {
      return 0;
    }

    for (const invoice of paidInvoices) {
      await this.syncMoveOutByFinalInvoicePaid(invoice._id);
    }

    return paidInvoices.length;
  }

  async _syncPendingMoveOutsWithPaidRefundTickets() {
    const candidates = await MoveOutRequest.find({
      status: { $in: ["Requested", "InvoiceReleased"] },
      finalInvoiceId: null,
    })
      .select("_id")
      .lean();

    if (candidates.length === 0) {
      return 0;
    }

    const requestIds = candidates.map((item) => item._id);

    const paidTickets = await FinancialTicket.find({
      referenceId: { $in: requestIds },
      status: "Paid",
      title: { $regex: /^Hoàn cọc trả phòng/i }
    })
      .select("_id referenceId title status")
      .sort({ createdAt: -1 })
      .lean();

    if (paidTickets.length === 0) {
      return 0;
    }

    const latestTicketByRequestId = new Map();
    for (const ticket of paidTickets) {
      const requestId = String(ticket.referenceId);
      if (!latestTicketByRequestId.has(requestId)) {
        latestTicketByRequestId.set(requestId, ticket);
      }
    }

    for (const ticket of latestTicketByRequestId.values()) {
      await this.syncDepositStatusByRefundTicket(ticket, "Paid");
    }

    return latestTicketByRequestId.size;
  }

  // ============================================================
  //  STEP 1 – Tenant tạo yêu cầu trả phòng
  // ============================================================
  /**
   * Kiểm tra + tạo MoveOutRequest
   * Rule (theo yêu cầu mới):
   *  - expectedMoveOutDate phải <= contract.endDate
   *  - Điều kiện hoàn cọc:
   *      + Thời gian ở từ startDate đến requestDate phải >= 6 tháng (180 ngày)
   *      + Khoảng cách từ requestDate đến endDate phải >= 30 ngày (báo trước)
   *  - expectedMoveOutDate là ngày trả phòng thực tế, có thể bằng endDate
   *  - Hợp đồng chỉ terminate khi đến ngày expectedMoveOutDate
   *  - Account chỉ inactive khi đến ngày expectedMoveOutDate VÀ không còn HĐ nào khác
   */
  async createMoveOutRequest(contractId, tenantId, expectedMoveOutDate, reason, confirmContinue = false) {
    console.log(`[MOVEOUT] 📋 Tenant tạo yêu cầu trả phòng...`);

    // 1. Lấy hợp đồng
    const contract = await Contract.findById(contractId)
      .populate('roomId', 'name roomCode');

    if (!contract) throw new Error("Không tìm thấy hợp đồng");
    if (contract.status !== "active")
      throw new Error(`Hợp đồng không ở trạng thái hoạt động (hiện tại: ${contract.status})`);

    // 2. Kiểm tra tenant khớp
    if (contract.tenantId.toString() !== String(tenantId))
      throw new Error("Bạn không có quyền tạo yêu cầu trả phòng cho hợp đồng này");

    // 3. Kiểm tra từng hợp đồng chỉ có 1 request
    const existing = await MoveOutRequest.findOne({ contractId });
    if (existing)
      throw new Error("Hợp đồng này đã có yêu cầu trả phòng. Mỗi hợp đồng chỉ tạo được một yêu cầu.");

    // 4. [Flowchart] expectedMoveOutDate < contract.endDate
    const moveOutDate = this._toDateOnly(expectedMoveOutDate);
    const endDate = this._toDateOnly(contract.endDate);

    if (Number.isNaN(moveOutDate.getTime())) {
      throw new Error("Ngày trả phòng không hợp lệ");
    }

    if (moveOutDate > endDate) {
      throw new Error(
        `Ngày trả phòng (${this._formatVNDate(moveOutDate)}) không được muộn hơn ngày kết thúc hợp đồng (${this._formatVNDate(endDate)})`
      );
    }

    // Kiểm tra ngày trả phòng không được ở quá khứ.
    const now = new Date();
    const today = this._toDateOnly(now);
    const daysNotice = this._getCalendarDaysDiff(today, moveOutDate);
    if (daysNotice < 0) {
      throw new Error("Ngày trả phòng phải từ ngày hiện tại trở đi");
    }

    // Điều kiện 1: Từ requestDate đến endDate phải >= 30 ngày (báo trước 30 ngày trước khi HĐ hết hạn).
    // Tức: endDate - requestDate >= 30 → endDate >= requestDate + 30 ngày
    const requestDate = this._toDateOnly(now);
    const daysBeforeContractEnd = this._getCalendarDaysDiff(requestDate, endDate);
    const hasEnoughNoticeDays = daysBeforeContractEnd >= MOVEOUT_POLICY.MIN_NOTICE_DAYS;
    const isEarlyNotice = !hasEnoughNoticeDays;

    // Điều kiện 2: Tính thời gian ở từ ngày bắt đầu HĐ đến requestDate (phải đủ 6 tháng).
    const stayMonthsToRequestDate = this._getCompletedMonths(contract.startDate, requestDate);
    const stayDaysToRequestDate = this._getCalendarDaysDiff(contract.startDate, requestDate);
    if (stayDaysToRequestDate < 0) {
      throw new Error("Hợp đồng chưa bắt đầu nên chưa thể tạo yêu cầu trả phòng");
    }

    const minStayDays = MOVEOUT_POLICY.MIN_STAY_MONTHS * 30;
    const hasEnoughStayDays = stayDaysToRequestDate >= minStayDays;
    const isUnderMinStay = !hasEnoughStayDays; // thuê chưa đủ 6 tháng

    // ============================================================
    //  🆕 KIỂM TRA GAP CONTRACT
    //  Người B (gap contract) LUÔN LUÔN được hoàn cọc
    // ============================================================
    const { isGapContract, primaryContract } = await this._checkIfGapContract(contract);
    let isDepositForfeited = false;
    let isEarlyNoticeEffective = isEarlyNotice; // effective = có bị phạt thật sự không
    let isUnderMinStayEffective = isUnderMinStay;

    if (isGapContract) {
      // Gap contract: KHÔNG bị phạt, luôn hoàn cọc
      isDepositForfeited = false;
      isEarlyNoticeEffective = false;
      isUnderMinStayEffective = false;
      console.log(`[MOVEOUT] ✅ Gap contract → LUÔN ĐƯỢC HOÀN CỌC`);
    } else {
      // Primary contract: áp dụng rule 30 ngày + 6 tháng
      isDepositForfeited = isEarlyNotice || isUnderMinStay;
    }
    // ============================================================
    //  KẾT THÚC KIỂM TRA GAP CONTRACT
    // ============================================================

    const warnings = [];

    // Chỉ hiển thị warning cho primary contract (gap contract không bị phạt)
    if (!isGapContract) {
      if (isEarlyNotice) {
        warnings.push({
          type: "early_notice",
          message: `Ngày yêu cầu trả phòng cách ngày kết thúc hợp đồng ${daysBeforeContractEnd} ngày, chưa đủ tối thiểu ${MOVEOUT_POLICY.MIN_NOTICE_DAYS} ngày báo trước. Trường hợp này sẽ không được hoàn cọc. Bạn có chắc chắn không?`
        });
      }

      if (isUnderMinStay) {
        warnings.push({
          type: "under_min_stay",
          message: `Bạn sẽ không được hoàn cọc vì thời gian ở tính đến ngày yêu cầu trả phòng là ${stayDaysToRequestDate} ngày, chưa đủ tối thiểu ${minStayDays} ngày (6 tháng). Bạn có chắc chắn không?`
        });
      }
    } else {
      // Gap contract: thông báo ưu đãi
      warnings.push({
        type: "gap_contract_deposit_protection",
        message: `Bạn là người thuê trong khoảng trống (gap contract). Bạn LUÔN ĐƯỢC hoàn cọc khi trả phòng, không phụ thuộc vào thời gian báo trước hay thời gian ở.`
      });
    }

    if (warnings.length > 0 && !confirmContinue) {
      return {
        requiresConfirmation: true,
        warnings,
        data: {
          contractId: contract._id,
          expectedMoveOutDate: moveOutDate,
          requestDate,
          daysNotice,
          daysBeforeContractEnd,
          stayMonths: stayMonthsToRequestDate,
          stayDays: stayDaysToRequestDate,
          isEarlyNotice: isEarlyNoticeEffective,   // effective value
          isUnderMinStay: isUnderMinStayEffective, // effective value
          isDepositForfeited,
          isGapContract,
          minNoticeDays: MOVEOUT_POLICY.MIN_NOTICE_DAYS,
          minStayMonths: MOVEOUT_POLICY.MIN_STAY_MONTHS
        }
      };
    }

    console.log(`[MOVEOUT] NoticeToMoveOut: ${daysNotice} ngày, Stay@Request: ${stayMonthsToRequestDate} tháng (${stayDaysToRequestDate} ngày), DaysBeforeEnd: ${daysBeforeContractEnd}, Forfeited: ${isDepositForfeited}`);

    // 6. Tạo request
    const moveOutRequest = new MoveOutRequest({
      contractId,
      tenantId,
      expectedMoveOutDate: moveOutDate,
      reason,
      requestDate,
      isEarlyNotice: isEarlyNoticeEffective,   // effective value (gap = false)
      isUnderMinStay: isUnderMinStayEffective, // effective value (gap = false)
      isDepositForfeited,
      isGapContract, // Lưu cờ gap contract vào request
      status: "Requested"
    });
    await moveOutRequest.save();

    // 7. Notify managers
    await this._notifyManagers(
      tenantId,
      contract,
      ` Yêu cầu trả phòng mới`,
      `Tenant yêu cầu trả phòng ${contract.roomId?.name || ''}.\nNgày trả phòng: ${this._formatVNDate(moveOutDate)}\nLý do: ${reason || 'Không có'}\n\nVui lòng kiểm tra phòng và phát hành hóa đơn cuối.`
    );

    console.log(`[MOVEOUT]  Yêu cầu tạo thành công: ${moveOutRequest._id}`);
    return moveOutRequest;
  }

  /**
   * STEP 3 – Manager phát hành hóa đơn cuối + xử lý hoàn cọc (KHÔNG cấn trừ).
   *
   * Luồng mới:
   * 1. Tạo hóa đơn cuối → gửi tenant thanh toán riêng (status = Unpaid).
   * 2. Tiền cọc xử lý hoàn riêng:
   *    - isDepositForfeited → đánh dấu Forfeited.
   *    - Ngược lại → đánh dấu Refunded + tạo phiếu chi hoàn cọc.
   * 3. Gửi notification báo tenant hóa đơn + tiền cọc xử lý riêng.
   */
  async releaseFinalInvoice(moveOutRequestId, managerInvoiceNotes = "", electricIndex, waterIndex) {
    console.log(`[MOVEOUT]  Manager phát hành hóa đơn cuối: ${moveOutRequestId}`);

    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");
    if (moveOutRequest.status !== "Requested")
      throw new Error(`Chỉ có thể phát hành hóa đơn khi trạng thái là Requested (hiện tại: ${moveOutRequest.status})`);

    // ─── Load hợp đồng + phòng ────────────────────────────────────────────
    const contract = await Contract.findById(moveOutRequest.contractId)
      .populate({ path: 'roomId', populate: { path: 'roomTypeId' } });
    if (!contract) throw new Error("Không tìm thấy hợp đồng");

    // ─── Validate: ngày hiện tại phải nằm trong khoảng từ requestDate đến endDate ──────────
    const todayDateOnly = this._toDateOnly(new Date());
    const requestDateOnly = this._toDateOnly(moveOutRequest.requestDate);
    const endDateOnly = this._toDateOnly(contract.endDate);
    if (todayDateOnly < requestDateOnly || todayDateOnly > endDateOnly) {
      throw new Error(
        `Chỉ có thể phát hành hóa đơn từ ngày yêu cầu trả phòng (${this._formatVNDate(requestDateOnly)}) đến ngày kết thúc hợp đồng (${this._formatVNDate(endDateOnly)}). Hôm nay là ${this._formatVNDate(todayDateOnly)}.`
      );
    }

    const parsedElectricIndex = electricIndex !== undefined && electricIndex !== null
      ? Number(electricIndex)
      : undefined;
    const parsedWaterIndex = waterIndex !== undefined && waterIndex !== null
      ? Number(waterIndex)
      : undefined;

    const room = contract.roomId;
    if (!room) throw new Error("Hợp đồng không có thông tin phòng");
    if (!room) throw new Error("Hợp đồng không có thông tin phòng");

    // ─── Thông số hóa đơn ─────────────────────────────────────────────────
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const moveOutDate = now;
    const dueDate = new Date(year, month, 5);
    const invoiceCode = `INV-${contract.contractCode}-${month}${year}`;
    const invoiceTitle = `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`;

    // Kiểm tra hóa đơn cùng kỳ đã paid chưa.
    const existingFinal = await InvoicePeriodic.findOne({ invoiceCode, contractId: contract._id });
    if (existingFinal?.status === 'Paid') {
      throw new Error('Hóa đơn tháng này đã được thanh toán, không thể cập nhật lại dữ liệu trả phòng.');
    }

    let parsedPrice = room.roomTypeId?.currentPrice || 0;
    parsedPrice = typeof parsedPrice === 'object' && parsedPrice.$numberDecimal
      ? parseFloat(parsedPrice.$numberDecimal)
      : Number(parsedPrice) || 0;

    const invoiceItems = [];
    let totalAmount = 0;
    const formatVN = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    // ─── 1. Tiền phòng còn lại tới ngày xuất phòng ───────────────────────
    // Tiền phòng KHÔNG tính vào hóa đơn cuối (đã thanh toán qua rentPaidUntil)
    invoiceItems.push({
      itemName: `Tiền thuê phòng (đã thanh toán qua tiền cọc)`,
      usage: 1,
      unitPrice: 0,
      amount: 0,
      isIndex: false
    });

    // ─── 2. Điện / Nước + Các dịch vụ có chỉ số – Lấy từ MeterReading ────
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    const METER_MAX = 99999;

    // Tìm các dịch vụ điện và nước (lấy luôn _id để so sánh chính xác)
    const [electricService, waterService] = await Promise.all([
      Service.findOne({ name: { $regex: /^(điện|dien)$/i } }),
      Service.findOne({ name: { $regex: /^(nước|nuoc)$/i } }),
    ]);
    const electricServiceId = electricService?._id?.toString();
    const waterServiceId = waterService?._id?.toString();

    // Khi manager nhập chỉ số mới → chỉ tạo MeterReading, KHÔNG tính trực tiếp vào hóa đơn
    if (parsedElectricIndex !== undefined || parsedWaterIndex !== undefined) {
      const manualInputs = [
        { type: 'electric', label: 'điện', inputIndex: parsedElectricIndex, utilityDoc: electricService },
        { type: 'water', label: 'nước', inputIndex: parsedWaterIndex, utilityDoc: waterService },
      ].filter((item) => item.inputIndex !== undefined && item.utilityDoc?._id);

      for (const manualInput of manualInputs) {
        const latestUtilityReading = await MeterReading.findOne({ roomId: room._id, utilityId: manualInput.utilityDoc._id })
          .sort({ readingDate: -1, createdAt: -1 }).populate('utilityId');
        const previousIndex = Number(latestUtilityReading?.newIndex) || 0;
        const finalNewIndex = Number(manualInput.inputIndex);

        // Kiểm tra bản ghi mới nhất có phải vừa được tạo trong request này không (trong vòng 2 phút)
        const TWO_MINUTES = 2 * 60 * 1000;
        const isRecentReading = latestUtilityReading?.createdAt &&
          (Date.now() - new Date(latestUtilityReading.createdAt).getTime()) < TWO_MINUTES;

        if (isRecentReading) {
          // Update bản ghi vừa tạo (sửa chỉ số nhập sai)
          latestUtilityReading.newIndex = finalNewIndex;
          latestUtilityReading.usageAmount = finalNewIndex - previousIndex;
          await latestUtilityReading.save();
          console.log(`[MOVEOUT] 🔄 Sửa chỉ số ${manualInput.label}: ${previousIndex} → ${finalNewIndex}`);
        } else {
          // Tạo MeterReading MỚI (lần nhập đầu tiên hoặc đã qua lâu)
          const usage = finalNewIndex - previousIndex;
          await MeterReading.create({
            roomId: room._id,
            utilityId: manualInput.utilityDoc._id,
            oldIndex: previousIndex,
            newIndex: finalNewIndex,
            usageAmount: usage,
            readingDate: moveOutDate
          });
          console.log(`[MOVEOUT] 📝 Ghi chỉ số ${manualInput.label} mới: ${previousIndex} → ${finalNewIndex} (usage: ${usage})`);
        }
      }
    }

    // Lấy tất cả MeterReading của phòng trong tháng để tính tiền (giống periodic)
    const recentReadingsForAll = await MeterReading.find({
      roomId: room._id,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    }).sort({ createdAt: -1 }).populate('utilityId');

    const allReadings = recentReadingsForAll.length > 0
      ? recentReadingsForAll
      : await MeterReading.find({ roomId: room._id }).sort({ createdAt: -1 }).limit(20).populate('utilityId');

    // Map để lấy 2 bản ghi mới nhất cho mỗi dịch vụ để tính usage chính xác
    const latestReadings = {};
    allReadings.forEach((reading) => {
      if (!reading.utilityId) return;
      const uId = reading.utilityId._id.toString();
      if (!latestReadings[uId]) {
        // Lưu bản ghi mới nhất
        latestReadings[uId] = { current: reading, previous: null, count: 1 };
      } else if (latestReadings[uId].count === 1) {
        // Lưu bản ghi trước đó để tính usage chính xác
        latestReadings[uId].previous = reading;
        latestReadings[uId].count = 2;
      }
    });

    // Tính tiền cho tất cả dịch vụ từ MeterReading (giống periodic)
    const normalizeUtilityName = (v = "") => v.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    Object.values(latestReadings).forEach(({ current, previous }) => {
      const newIndex = Number(current.newIndex) || 0;
      let oldIndex;
      let usage;

      if (previous) {
        // Có bản ghi trước → usage = newIndex mới - newIndex cũ (chỉ số kết thúc của reading trước)
        oldIndex = Number(previous.newIndex) || 0;
        usage = newIndex - oldIndex;
        // Xử lý reset đồng hồ: VD 99999 → 50: usage = (99999-99999) + 50 = 50
        if (usage < 0) {
          usage = (METER_MAX - oldIndex) + newIndex;
        }
      } else {
        // Không có bản ghi trước → dùng oldIndex của bản ghi hiện tại
        oldIndex = Number(current.oldIndex) || 0;
        usage = newIndex - oldIndex;
        if (usage < 0) {
          usage = (METER_MAX - oldIndex) + newIndex;
        }
      }

      if (usage <= 0) return;

      let servicePrice = current.utilityId.currentPrice || current.utilityId.price || 0;
      servicePrice = typeof servicePrice === 'object' && servicePrice.$numberDecimal
        ? parseFloat(servicePrice.$numberDecimal)
        : Number(servicePrice) || 0;

      const amount = usage * servicePrice;
      totalAmount += amount;
      const serviceName = current.utilityId.name || current.utilityId.serviceName || "Dịch vụ";
      invoiceItems.push({
        itemName: `Tiền ${serviceName.toLowerCase()}`,
        oldIndex,
        newIndex,
        usage,
        unitPrice: servicePrice,
        amount,
        isIndex: true
      });
      console.log(`[MOVEOUT] 💡 ${serviceName}: ${oldIndex} → ${newIndex} = ${usage} × ${servicePrice.toLocaleString('vi-VN')} = ${amount.toLocaleString('vi-VN')} VND`);
    });

    // ─── 3. Dịch vụ mở rộng từ BookService ──────────────────────────────
    const contractBookServices = await BookService.find({ contractId: contract._id })
      .populate('services.serviceId');
    const bookServiceItems = contractBookServices.flatMap((doc) =>
      Array.isArray(doc.services) ? doc.services : []
    );

    if (bookServiceItems.length > 0) {
      const moveOutDay = new Date(moveOutDate);
      moveOutDay.setHours(23, 59, 59, 999);
      const serviceChargeMap = new Map();

      bookServiceItems.forEach((srvItem) => {
        if (!srvItem?.serviceId) return;

        const startDate = srvItem.startDate ? new Date(srvItem.startDate) : null;
        const endDate = srvItem.endDate ? new Date(srvItem.endDate) : null;

        if (startDate) {
          startDate.setHours(0, 0, 0, 0);
          if (startDate > moveOutDay) return;
        }
        if (endDate) {
          endDate.setHours(23, 59, 59, 999);
          if (endDate < moveOutDay) return;
        }

        const srvItemName = srvItem.serviceId.name || srvItem.serviceId.serviceName || "Dịch vụ";
        const srvItemId = srvItem.serviceId._id?.toString();
        if (srvItemId === electricServiceId || srvItemId === waterServiceId) return;

        let srvPrice = srvItem.serviceId.currentPrice || srvItem.serviceId.price || 0;
        srvPrice = typeof srvPrice === 'object' && srvPrice.$numberDecimal
          ? parseFloat(srvPrice.$numberDecimal)
          : Number(srvPrice) || 0;
        if (!Number.isFinite(srvPrice) || srvPrice < 0) return;

        const finalQty = Number(srvItem.quantity) || 1;
        if (!Number.isFinite(finalQty) || finalQty <= 0) return;

        const serviceKey = srvItem.serviceId._id ? srvItem.serviceId._id.toString() : `${srvItemName}-${finalQty}-${srvPrice}`;
        const existing = serviceChargeMap.get(serviceKey);
        if (!existing || ((existing.startDate || 0) > (startDate || 0))) {
          serviceChargeMap.set(serviceKey, { itemName: srvItemName, quantity: finalQty, unitPrice: srvPrice, startDate });
        }
      });

      for (const chargeItem of serviceChargeMap.values()) {
        const amount = chargeItem.quantity * chargeItem.unitPrice;
        totalAmount += amount;
        invoiceItems.push({ itemName: `Dịch vụ ${chargeItem.itemName}`, oldIndex: 0, newIndex: 0, usage: chargeItem.quantity, unitPrice: chargeItem.unitPrice, amount, isIndex: false });
      }
      console.log(`[MOVEOUT] 📦 Đã thêm ${serviceChargeMap.size} item dịch vụ từ BookService`);
    } else {
      console.log(`[MOVEOUT] ℹ️ Không có BookService cho contract này`);
    }

    // ─── Lưu hóa đơn cuối ────────────────────────────────────────────────
    if (existingFinal) {
      existingFinal.title = invoiceTitle;
      existingFinal.items = invoiceItems;
      existingFinal.totalAmount = totalAmount;
      existingFinal.dueDate = dueDate;
      existingFinal.status = 'Unpaid';
      await existingFinal.save();
      console.log(`[MOVEOUT] ✅ Hóa đơn cuối cập nhật: ${existingFinal._id} | Tổng: ${totalAmount}`);
    } else {
      await InvoicePeriodic.create({
        invoiceCode, contractId: contract._id, title: invoiceTitle,
        items: invoiceItems, totalAmount, dueDate, status: 'Unpaid',
      });
      console.log(`[MOVEOUT] ✅ Hóa đơn cuối tạo mới: ${invoiceCode} | Tổng: ${totalAmount}`);
    }

    const finalInvoice = await InvoicePeriodic.findOne({ invoiceCode, contractId: contract._id });

    // ─── Xử lý cọc + tiền phòng trả trước dư ─────────────────────────────
    const isDepositForfeited = Boolean(moveOutRequest.isDepositForfeited);
    const deposit = await this._findDepositForContract(contract);

    // Tiền phòng trả trước: bỏ tháng hiện tại, tính từ tháng tiếp theo đến rentPaidUntil
    const { months: prepaidMonths, amount: prepaidRentOverpay } = await this._calculatePrepaidMonthsAndAmount(contract);

    // Tiền cọc hoàn (nếu không bị tịch thu)
    const depositRefundAmount = deposit && !isDepositForfeited ? Math.max(Number(deposit.amount) || 0, 0) : 0;

    // Tổng hoàn = cọc + prepaid dư
    const totalRefundAmount = depositRefundAmount + prepaidRentOverpay;

    console.log(`[MOVEOUT] 💰 deposit=${depositRefundAmount} | prepaid=${prepaidRentOverpay} (${prepaidMonths} tháng) | total=${totalRefundAmount}`);

    moveOutRequest.finalInvoiceId = finalInvoice._id;
    moveOutRequest.managerInvoiceNotes = managerInvoiceNotes;
    moveOutRequest.depositRefundAmount = totalRefundAmount;
    moveOutRequest.prepaidRentOverpay = prepaidRentOverpay;
    moveOutRequest.prepaidMonths = prepaidMonths;
    moveOutRequest.status = "InvoiceReleased";
    moveOutRequest.paymentDate = null;
    await moveOutRequest.save();

    // ─── Notification ─────────────────────────────────────────────────────
    const invoiceText = (finalInvoice?.totalAmount || 0).toLocaleString('vi-VN');
    const depositRefundText = depositRefundAmount.toLocaleString('vi-VN');
    const prepaidRefundText = prepaidRentOverpay.toLocaleString('vi-VN');
    const totalRefundText = totalRefundAmount.toLocaleString('vi-VN');

    let noticeContent = `Quản lý đã kiểm tra phòng ${contract?.roomId?.name || ''} và phát hành hóa đơn cuối.\n` +
      `Tổng chi phí chốt: ${invoiceText} VND.\n\n` +
      `Vui lòng thanh toán hóa đơn cuối để hoàn tất thủ tục trả phòng.\n`;

    if (isDepositForfeited) {
      if (prepaidRentOverpay > 0) {
        noticeContent += `\nTiền cọc sẽ không được hoàn do không đủ điều kiện. Tiền phòng trả trước dư sẽ được hoàn: ${prepaidRefundText} VND (${prepaidMonths} tháng).`;
      } else {
        noticeContent += `\nTiền cọc sẽ không được hoàn do không đủ điều kiện.`;
      }
    } else if (totalRefundAmount > 0) {
      if (prepaidRentOverpay > 0) {
        noticeContent += `\nTiền hoàn khi trả phòng (gộp cọc + tiền trả trước dư): ${totalRefundText} VND.\n` +
          `  • Tiền cọc: ${depositRefundText} VND\n` +
          `  • Tiền phòng trả trước dư: ${prepaidRefundText} VND`;
      } else {
        noticeContent += `\nTiền cọc sẽ được hoàn sau khi thanh toán: ${depositRefundText} VND.`;
      }
    }

    await this._notifyTenant(moveOutRequest.tenantId, `📄 Hóa đơn cuối đã được phát hành`, noticeContent);

    return {
      moveOutRequest,
      finalInvoice,
      settlement: {
        invoiceAmount: finalInvoice?.totalAmount || 0,
        depositRefundAmount,
        prepaidRentOverpay,
        totalRefundAmount,
        isDepositForfeited,
        refundTicket: null, // sẽ tạo ở STEP 4 (Paid)
      },
    };
  }

  /**
   * STEP 4 – Lấy thông tin so sánh cọc vs hóa đơn cuối (KHÔNG cấn trừ).
   *
   * Response trả về:
   * - depositId, depositStatus, depositAmount
   * - invoiceAmount: tổng hóa đơn cuối (finalInvoice.totalAmount)
   * - depositRefundAmount: số tiền cọc sẽ hoàn (từ moveOutRequest.depositRefundAmount)
   * - isDepositForfeited: có mất cọc không
   * - refundTicket: phiếu chi hoàn cọc (nếu có)
   */
  async getDepositVsInvoice(moveOutRequestId) {
    console.log(`[MOVEOUT] 🔍 So sánh cọc vs hóa đơn: ${moveOutRequestId}`);

    await this._syncMoveOutByRequestId(moveOutRequestId);
    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");

    const contract = await Contract.findById(moveOutRequest.contractId);
    if (!contract) throw new Error("Không tìm thấy hợp đồng");

    const deposit = await this._findDepositForContract(contract);
    const depositRefundAmount = Math.max(Number(moveOutRequest.depositRefundAmount) || 0, 0);
    const isDepositForfeited = Boolean(moveOutRequest.isDepositForfeited);

    const refundTicket = await FinancialTicket.findOne({
      referenceId: moveOutRequest._id,
      title: { $in: [/^Hoàn cọc trả phòng/i, /^Hoàn tiền trả phòng/i] }
    })
      .select("_id amount status paymentVoucher transactionDate")
      .sort({ createdAt: -1 })
      .lean();

    const base = {
      depositId: deposit?._id || null,
      depositStatus: deposit?.status || null,
      depositAmount: deposit ? Number(deposit.amount) || 0 : 0,
      invoiceAmount: 0,
      depositRefundAmount,
      prepaidRentOverpay: moveOutRequest.prepaidRentOverpay || 0,
      isDepositForfeited,
      refundTicket,
    };

    if (!moveOutRequest.finalInvoiceId) {
      return { ...base };
    }

    const finalInvoice = await InvoicePeriodic.findById(moveOutRequest.finalInvoiceId);
    if (!finalInvoice) throw new Error("Không tìm thấy hóa đơn cuối");

    const invoiceAmount = Number(finalInvoice.totalAmount) || 0;
    const remainingToPay = invoiceAmount;

    return {
      ...base,
      invoiceAmount,
      remainingToPay,
    };
  }

  async completeMoveOut(moveOutRequestId, managerCompletionNotes = "") {
    console.log(`[MOVEOUT] 🏁 Manager hoàn tất trả phòng: ${moveOutRequestId}`);

    await this._syncMoveOutByRequestId(moveOutRequestId);
    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) {
      throw new Error("Không tìm thấy yêu cầu trả phòng");
    }

    if (moveOutRequest.status !== "Paid") {
      throw new Error(`Chỉ có thể hoàn tất trả phòng khi trạng thái là Paid (hiện tại: ${moveOutRequest.status})`);
    }

    const contract = await Contract.findById(moveOutRequest.contractId)
      .select("_id contractCode status depositId roomId");
    if (!contract) {
      throw new Error("Không tìm thấy hợp đồng");
    }

    const deposit = await this._findDepositForContract(contract);
    const isDepositForfeited = Boolean(moveOutRequest.isDepositForfeited);
    const depositAmt = deposit ? Math.max(Number(deposit.amount) || 0, 0) : 0;
    const prepaidAmt = Math.max(Number(moveOutRequest.prepaidRentOverpay) || 0, 0);
    const prepaidMths = Number(moveOutRequest.prepaidMonths) || 0;
    const totalRefund = Math.max(Number(moveOutRequest.depositRefundAmount) || 0, 0);
    const contractCode = contract.contractCode || String(moveOutRequest.contractId);

    // ─── Cập nhật trạng thái tiền cọc ────────────────────────────────────
    if (deposit?._id) {
      if (isDepositForfeited) {
        await Deposit.findByIdAndUpdate(deposit._id, {
          status: "Forfeited",
          refundDate: null,
          forfeitedDate: new Date(),
        });
      } else {
        await Deposit.findByIdAndUpdate(deposit._id, {
          status: "Refunded",
          refundDate: new Date(),
          forfeitedDate: null,
        });
      }
    }

    // ─── Phếu chi đã được tạo khi chuyển sang trạng thái Paid ──────────────────
    // (xử lý trong syncMoveOutByFinalInvoicePaid, không tạo lại ở đây)

    // Terminate hợp đồng khi hoàn tất trả phòng (luôn terminate, không cần chờ ngày)
    if (contract.status !== "terminated") {
      contract.status = "terminated";
      await contract.save();
    }

    // ============================================================
    //  🆕 XỬ LÝ ROOM STATUS SAU KHI TERMINATE HỢP ĐỒNG
    // ============================================================
    // Nếu là gap contract → dùng logic gap (giữ Deposited/Occupied nếu còn primary)
    // Nếu là primary contract (hoặc hợp đồng thường) → kiểm tra phòng có contract còn lại không
    await this._handleRoomStatusAfterGapMoveOut(contract);

    // Sau khi gap handler chạy xong, kiểm tra thêm:
    // Nếu trên phòng không còn bất kỳ contract nào active/inactive → set Available
    if (contract.roomId) {
      const remainingActiveContracts = await Contract.countDocuments({
        roomId: contract.roomId,
        _id: { $ne: contract._id },
        status: { $in: ['active', 'inactive'] },
      });

      if (remainingActiveContracts === 0) {
        const room = await Room.findById(contract.roomId);
        if (room && room.status !== 'Available') {
          room.status = 'Available';
          await room.save();
          console.log(`[MOVEOUT] 🏠 Không còn hợp đồng nào trên phòng → Room ${room.name || room._id}: Available`);
        }
      } else {
        console.log(`[MOVEOUT] ℹ️ Phòng vẫn còn ${remainingActiveContracts} hợp đồng active/inactive → giữ nguyên room status`);
      }
    }
    // ============================================================

    // Chỉ inactive tenant khi expectedMoveOutDate đã đến VÀ đây là hợp đồng cuối cùng
    const today = this._toDateOnly(new Date());
    const expectedDate = this._toDateOnly(moveOutRequest.expectedMoveOutDate);
    const datePassed = today >= expectedDate;

    if (datePassed) {
      const tenant = await User.findById(moveOutRequest.tenantId).select("_id status");
      if (tenant && tenant.status !== "inactive") {
        const activeContractCount = await Contract.countDocuments({
          tenantId: moveOutRequest.tenantId,
          _id: { $ne: moveOutRequest.contractId },
          status: { $in: ["active", "extended"] }
        });
        if (activeContractCount === 0) {
          tenant.status = "inactive";
          await tenant.save();
        }
      }
    }

    moveOutRequest.status = "Completed";
    moveOutRequest.completedDate = new Date();
    moveOutRequest.managerCompletionNotes = managerCompletionNotes;
    await moveOutRequest.save();

    // Gửi notification hoàn tất kèm thông tin hoàn tiền (theo 3 case)
    let completionContent = `Quản lý đã xác nhận hoàn tất quy trình trả phòng.`;
    if (!isDepositForfeited && totalRefund > 0) {
      // Case 1: hoàn cọc (+ prepaid nếu có)
      completionContent += `\n\n💰 Tổng tiền hoàn: ${totalRefund.toLocaleString('vi-VN')} VND`;
      if (depositAmt > 0) {
        completionContent += `\n  • Tiền cọc: ${depositAmt.toLocaleString('vi-VN')} VND`;
      }
      if (prepaidAmt > 0) {
        completionContent += `\n  • Tiền phòng trả trước dư (${prepaidMths} tháng): ${prepaidAmt.toLocaleString('vi-VN')} VND`;
      }
      completionContent += `\n\nPhiếu chi đã được tạo. Kế toán sẽ liên hệ chi tiền.`;
    } else if (isDepositForfeited && prepaidAmt > 0) {
      // Case 2: chỉ hoàn tiền phòng trả trước
      completionContent += `\n\n💰 Tiền phòng trả trước được hoàn: ${prepaidAmt.toLocaleString('vi-VN')} VND (${prepaidMths} tháng).`;
      completionContent += `\n\nPhiếu chi đã được tạo. Kế toán sẽ liên hệ chi tiền.`;
    } else if (isDepositForfeited) {
      // Case 3: không hoàn gì
      completionContent += `\n\nTiền cọc sẽ không được hoàn do không đủ điều kiện.`;
    }
    if (managerCompletionNotes) {
      completionContent += `\n\nGhi chú: ${managerCompletionNotes}`;
    }

    await this._notifyTenant(
      moveOutRequest.tenantId,
      `Trả phòng đã hoàn tất`,
      completionContent
    );

    return moveOutRequest;
  }

  // ============================================================
  //  READ – Lấy danh sách / chi tiết
  // ============================================================
  async getMoveOutRequestById(moveOutRequestId) {
    await this._syncMoveOutByRequestId(moveOutRequestId);

    const req = await MoveOutRequest.findById(moveOutRequestId)
      .populate('finalInvoiceId', 'invoiceCode totalAmount status dueDate items title')
      .populate({
        path: 'contractId',
        select: 'contractCode startDate endDate depositId roomId duration rentPaidUntil status',
        populate: [
          { path: 'roomId', select: 'name roomCode', populate: [{ path: 'floorId', select: 'name' }, { path: 'roomTypeId', select: 'currentPrice name' }] },
        ]
      })
      .populate('tenantId', 'email phoneNumber username');

    if (!req) throw new Error("Không tìm thấy yêu cầu trả phòng");

    // Tính rentAmount từ roomTypeId.currentPrice (nằm trên Room, không phải Contract)
    const result = req.toObject();

    // Enrich tenant fullName + cccd từ UserInfo (phải làm SAU toObject, sau đó set vào plain object)
    if (result.tenantId?._id) {
      const userIdRaw = result.tenantId._id;
      const userIdStr = typeof userIdRaw === 'object' && userIdRaw !== null
        ? userIdRaw.toString()
        : String(userIdRaw);

      console.log(`[MOVEOUT] 🔍 result.tenantId._id =`, userIdStr, `| type = ${typeof userIdRaw}`);

      // Chuyển sang ObjectId nếu cần
      const userIdQuery = (userIdRaw && typeof userIdRaw === 'object')
        ? userIdRaw
        : (userIdStr.length === 24 ? require('mongoose').Types.ObjectId.createFromHexString(userIdStr) : userIdRaw);

      const userInfo = await UserInfo.findOne({ userId: userIdQuery }).select('fullname cccd');
      if (userInfo) {
        result.tenantId.fullName = userInfo.fullname;
        result.tenantId.cccd = userInfo.cccd || null;
      }
    }

    if (result.contractId?.roomId?.roomTypeId) {
      const price = result.contractId.roomId.roomTypeId.currentPrice;
      if (price) {
        if (typeof price === 'object' && price.$numberDecimal) {
          result.contractId.rentAmount = parseFloat(price.$numberDecimal);
        } else if (typeof price.toString === 'function') {
          result.contractId.rentAmount = parseFloat(price.toString());
        } else {
          result.contractId.rentAmount = Number(price) || 0;
        }
      }
    }

    return result;
  }

  async getMoveOutRequestByContractId(contractId) {
    console.log(`[MOVEOUT] Kiểm tra request cho contract: ${contractId}`);

    const reqRef = await MoveOutRequest.findOne({ contractId }).select("_id");
    if (!reqRef) {
      console.log(`[MOVEOUT] Không có request cho contract: ${contractId}`);
      return null;
    }

    await this._syncMoveOutByRequestId(reqRef._id);

    const req = await MoveOutRequest.findById(reqRef._id)
      .populate('finalInvoiceId', 'invoiceCode totalAmount status dueDate');

    console.log(`[MOVEOUT] ✅ Tìm thấy: ${req._id}`);
    return req;
  }

  async getAllMoveOutRequests(status, page = 1, limit = 20) {
    await this._syncPendingMoveOutsWithPaidInvoices();
    await this._syncPendingMoveOutsWithPaidRefundTickets();

    const skip = (page - 1) * limit;
    const query = {};
    if (status) query.status = status;

    require('../../room-floor-management/models/room.model');

    const moveOutRequests = await MoveOutRequest.find(query)
      .populate({
        path: 'contractId',
        select: 'contractCode startDate endDate depositId roomId duration rentAmount rentPaidUntil status',
        populate: { path: 'roomId', select: 'name roomCode', populate: { path: 'floorId', select: 'name' } }
      })
      .populate('tenantId', 'email phoneNumber username cccd')
      .populate('finalInvoiceId', 'invoiceCode totalAmount status dueDate')
      .sort({ requestDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await MoveOutRequest.countDocuments(query);

    // Enrich với fullname + cccd từ UserInfo
    const tenantIds = moveOutRequests
      .filter(r => r.tenantId?._id)
      .map(r => r.tenantId._id);

    const userInfoList = await UserInfo.find({ userId: { $in: tenantIds } }).select('userId fullname cccd');
    const userInfoMap = {};
    userInfoList.forEach(ui => { userInfoMap[ui.userId.toString()] = ui; });

    const enriched = moveOutRequests.map(r => {
      const obj = r.toObject();
      if (obj.tenantId?._id) {
        const ui = userInfoMap[obj.tenantId._id.toString()];
        if (ui) {
          obj.tenantId.fullName = ui.fullname;
          obj.tenantId.cccd = ui.cccd || null;
        }
      }
      return obj;
    });

    return {
      moveOutRequests: enriched,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalCount: total,
        limit
      }
    };
  }

  // ============================================================
  //  PRIVATE HELPERS
  // ============================================================
  async _notifyManagers(tenantId, contract, title, content) {
    try {
      const managers = await User.find({ role: 'manager', status: 'active' }).select('_id');
      if (managers.length === 0) return;

      // Use atomic upsert operation to prevent notification duplication
      // Each (contractId + moveOutRequest) creates only one notification batch
      const logKey = `moveout_notify_managers_${contract._id}`;

      const existing = await Notification.findOne({
        type: 'system',
        title: title,
        'recipients.recipient_id': { $in: managers.map(m => m._id) }
      });

      // Only create notification if it doesn't already exist for this moveout
      if (!existing) {
        const notification = new Notification({
          title,
          content,
          type: 'system',
          status: 'sent',
          created_by: null,
          recipients: managers.map(m => ({
            recipient_id: m._id,
            recipient_role: 'manager',
            is_read: false,
            read_at: null
          }))
        });
        await notification.save();
        console.log(`[MOVEOUT] ✅ Đã notify ${managers.length} manager`);
      } else {
        console.log(`[MOVEOUT] ℹ️ Manager notification đã tồn tại, bỏ qua để tránh trùng lặp`);
      }
    } catch (err) {
      console.warn(`[MOVEOUT] ⚠️ Lỗi notify manager: ${err.message}`);
    }
  }

  // ============================================================
  //  TENANT – Xoá yêu cầu trả phòng
  //  Chỉ cho phép xoá khi status = 'Requested' hoặc 'InvoiceReleased'
  // ============================================================
  async deleteMoveOutRequest(moveOutRequestId, tenantId) {
    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId)
      .populate('contractId', 'tenantId');

    if (!moveOutRequest) {
      const error = new Error("Không tìm thấy yêu cầu trả phòng.");
      error.status = 404;
      throw error;
    }

    // Kiểm tra tenant sở hữu yêu cầu này
    const contract = moveOutRequest.contractId;
    const ownerId = contract?.tenantId?._id?.toString?.() || contract?.tenantId?.toString?.() || contract?.tenantId;
    if (ownerId && ownerId.toString() !== tenantId.toString()) {
      const error = new Error("Bạn không có quyền xoá yêu cầu trả phòng này.");
      error.status = 403;
      throw error;
    }

    // Kiểm tra trạng thái cho phép xoá — chỉ cho phép khi Requested
    if (moveOutRequest.status !== 'Requested') {
      const error = new Error(
        `Không thể xoá yêu cầu trả phòng ở trạng thái "${moveOutRequest.status}". ` +
        `Chỉ có thể xoá khi trạng thái là "Đã yêu cầu".`
      );
      error.status = 400;
      throw error;
    }

    // Xoá move-out request
    await MoveOutRequest.findByIdAndDelete(moveOutRequestId);

    // Xoá hóa đơn cuối nếu có
    if (moveOutRequest.finalInvoiceId) {
      await Invoice.findByIdAndDelete(moveOutRequest.finalInvoiceId);
    }

    return { deletedId: moveOutRequestId };
  }

  async _notifyTenant(tenantId, title, content) {
    try {
      // Check if similar notification already exists
      const existing = await Notification.findOne({
        type: 'system',
        title: title,
        'recipients.recipient_id': tenantId
      });

      if (!existing) {
        const notification = new Notification({
          title,
          content,
          type: 'system',
          status: 'sent',
          created_by: null,
          recipients: [{
            recipient_id: tenantId,
            recipient_role: 'tenant',
            is_read: false,
            read_at: null
          }]
        });
        await notification.save();
        console.log(`[MOVEOUT] ✅ Đã notify tenant`);
      } else {
        console.log(`[MOVEOUT] ℹ️ Tenant notification đã tồn tại, bỏ qua để tránh trùng lặp`);
      }
    } catch (err) {
      console.warn(`[MOVEOUT] ⚠️ Lỗi notify tenant: ${err.message}`);
    }
  }
}

module.exports = new MoveOutRequestService();
