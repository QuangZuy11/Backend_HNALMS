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
  MIN_STAY_MONTHS: 6
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DEPOSIT_OFFSET_ITEM_NAME = "Cấn trừ tiền cọc";

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

    return new Date(Date.UTC(year, month - 1, day));
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

  _isDepositUsableForSettlement(status, options = {}) {
    const { isLinkedToContract = false } = options;

    if (status === "Held" || status === "Refunded") {
      return true;
    }

    // Dữ liệu cũ có thể bị cron chuyển Expired/Pending dù cọc đã gắn hợp đồng.
    // Với cọc đã liên kết hợp đồng, vẫn cho phép dùng để tất toán khi trả phòng.
    if (isLinkedToContract && (status === "Expired" || status === "Pending")) {
      return true;
    }

    return false;
  }

  _getAppliedDepositOffset(finalInvoice) {
    if (!Array.isArray(finalInvoice?.items)) {
      return 0;
    }

    return finalInvoice.items.reduce((sum, item) => {
      const name = String(item?.itemName || "").trim().toLowerCase();
      const amount = Number(item?.amount) || 0;

      if (name.startsWith(DEPOSIT_OFFSET_ITEM_NAME.toLowerCase()) && amount < 0) {
        return sum + Math.abs(amount);
      }

      return sum;
    }, 0);
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

  async _calculateDepositSettlement(moveOutRequest, contract, finalInvoice) {
    let depositAmount = 0;
    let depositId = null;
    let depositStatus = null;
    let usableDepositAmount = 0;
    const linkedDepositId = contract?.depositId ? String(contract.depositId) : null;
    let isLinkedToContract = false;

    const deposit = await this._findDepositForContract(contract);
    if (deposit) {
      depositStatus = deposit.status;
      depositId = deposit._id;
      isLinkedToContract = Boolean(
        linkedDepositId && depositId && String(depositId) === linkedDepositId
      );
      // Luôn trả dữ liệu tiền cọc để frontend hiển thị.
      depositAmount = Number(deposit.amount) || 0;
      // Chỉ dùng các trạng thái hợp lệ để cấn trừ nghiệp vụ.
      if (this._isDepositUsableForSettlement(deposit.status, { isLinkedToContract })) {
        usableDepositAmount = depositAmount;
      }
    }

    const netInvoiceAmount = Number(finalInvoice?.totalAmount) || 0;
    const appliedDepositOffset = this._getAppliedDepositOffset(finalInvoice);
    const invoiceAmount = netInvoiceAmount + appliedDepositOffset;
    const isDepositForfeited = Boolean(moveOutRequest?.isDepositForfeited);
    const effectiveUsableDeposit = isDepositForfeited ? 0 : usableDepositAmount;
    const recommendedDepositOffset = Math.min(effectiveUsableDeposit, invoiceAmount);
    const remainingToPay = Math.max(invoiceAmount - recommendedDepositOffset, 0);
    const refundToTenant = Math.max(effectiveUsableDeposit - invoiceAmount, 0);
    const depositCoversInvoice = remainingToPay === 0;

    return {
      depositId,
      depositStatus,
      isLinkedToContract,
      depositAmount,
      usableDepositAmount,
      invoiceAmount,
      netInvoiceAmount,
      appliedDepositOffset,
      recommendedDepositOffset,
      depositCoversInvoice,
      remainingToPay,
      refundToTenant,
      isDepositForfeited
    };
  }

  async _applyDepositOffsetIfNeeded(moveOutRequest, contract, finalInvoice) {
    let settlement = await this._calculateDepositSettlement(moveOutRequest, contract, finalInvoice);
    const offsetToApply = Math.max(
      settlement.recommendedDepositOffset - settlement.appliedDepositOffset,
      0
    );

    if (offsetToApply <= 0) {
      return settlement;
    }

    finalInvoice.items = Array.isArray(finalInvoice.items) ? finalInvoice.items : [];
    finalInvoice.items.push({
      itemName: `${DEPOSIT_OFFSET_ITEM_NAME} (${offsetToApply.toLocaleString('vi-VN')} VND)`,
      usage: 1,
      unitPrice: -offsetToApply,
      amount: -offsetToApply,
      isIndex: false
    });
    finalInvoice.totalAmount = Math.max((Number(finalInvoice.totalAmount) || 0) - offsetToApply, 0);
    finalInvoice.status = finalInvoice.totalAmount <= 0 ? "Paid" : "Unpaid";
    await finalInvoice.save();

    settlement = await this._calculateDepositSettlement(moveOutRequest, contract, finalInvoice);
    return settlement;
  }

  async _persistFinalInvoiceDraft(contractId, finalInvoiceDraft) {
    const existingFinal = await InvoicePeriodic.findOne({
      invoiceCode: finalInvoiceDraft.invoiceCode,
      contractId
    });

    if (existingFinal) {
      if (existingFinal.status === 'Paid') {
        throw new Error('Hóa đơn tháng này đã được thanh toán, không thể cập nhật lại dữ liệu trả phòng.');
      }

      existingFinal.title = finalInvoiceDraft.title;
      existingFinal.items = finalInvoiceDraft.items;
      existingFinal.totalAmount = finalInvoiceDraft.totalAmount;
      existingFinal.dueDate = finalInvoiceDraft.dueDate;
      existingFinal.status = finalInvoiceDraft.status || 'Unpaid';

      await existingFinal.save();
      console.log(`[MOVEOUT] ✅ Hóa đơn cuối đã cập nhật: ${existingFinal._id} | Tổng: ${existingFinal.totalAmount}`);
      return existingFinal;
    }

    const finalInvoice = new InvoicePeriodic({
      invoiceCode: finalInvoiceDraft.invoiceCode,
      contractId,
      title: finalInvoiceDraft.title,
      items: finalInvoiceDraft.items,
      totalAmount: finalInvoiceDraft.totalAmount,
      dueDate: finalInvoiceDraft.dueDate,
      status: finalInvoiceDraft.status || 'Unpaid'
    });

    await finalInvoice.save();
    console.log(`[MOVEOUT] ✅ Hóa đơn cuối đã lưu: ${finalInvoice._id} | Tổng: ${finalInvoice.totalAmount}`);
    return finalInvoice;
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

    const moveOutRequest = await MoveOutRequest.findOne({ finalInvoiceId })
      .select("_id contractId status paymentDate isDepositForfeited");
    if (!moveOutRequest) {
      console.warn(`[MOVEOUT] ⚠️ Không tìm thấy move-out liên kết với finalInvoiceId: ${finalInvoiceId}`);
      return null;
    }

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
      const contract = await Contract.findById(moveOutRequest.contractId)
        .select("depositId roomId")
        .lean();

      if (contract) {
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

    return {
      moveOutRequestId: moveOutRequest._id,
      status: updates.status || moveOutRequest.status,
      isDepositForfeited: moveOutRequest.isDepositForfeited,
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
        title: { $regex: /^Hoàn cọc trả phòng/i }
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
   * Rule (từ flowchart):
  *  - expectedMoveOutDate phải < contract.endDate
  *  - Đủ điều kiện hoàn cọc nếu:
  *      + Thời gian thuê tính từ startDate đến hiện tại >= 6 tháng (quy đổi tối thiểu 180 ngày)
  *      + expectedMoveOutDate phải trước endDate tối thiểu 30 ngày
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

    if (moveOutDate >= endDate) {
      throw new Error(
        `Ngày trả phòng (${this._formatVNDate(moveOutDate)}) phải nhỏ hơn ngày kết thúc hợp đồng (${this._formatVNDate(endDate)})`
      );
    }

    // 5. Tính điều kiện hoàn cọc theo rule hiện tại
    const now = new Date();
    const today = this._toDateOnly(now);

    // Vẫn kiểm tra ngày trả phòng không được ở quá khứ.
    const daysNotice = this._getCalendarDaysDiff(today, moveOutDate);
    if (daysNotice < 0) {
      throw new Error("Ngày trả phòng phải từ ngày hiện tại trở đi");
    }

    // Điều kiện 1: Ngày trả phòng phải trước ngày kết thúc hợp đồng tối thiểu 30 ngày.
    const daysBeforeContractEnd = this._getCalendarDaysDiff(moveOutDate, endDate);
    const hasEnoughNoticeDays = daysBeforeContractEnd >= MOVEOUT_POLICY.MIN_NOTICE_DAYS;
    const isEarlyNotice = !hasEnoughNoticeDays;

    // Điều kiện 2: Tính thời gian ở từ ngày bắt đầu hợp đồng đến thời điểm hiện tại.
    const stayMonthsToToday = this._getCompletedMonths(contract.startDate, today);
    const stayDaysToToday = this._getCalendarDaysDiff(contract.startDate, today);
    if (stayDaysToToday < 0) {
      throw new Error("Hợp đồng chưa bắt đầu nên chưa thể tạo yêu cầu trả phòng");
    }

    const minStayDays = MOVEOUT_POLICY.MIN_STAY_MONTHS * 30;
    const hasEnoughStayDays = stayDaysToToday >= minStayDays;
    const isUnderMinStay = !hasEnoughStayDays; // thuê chưa đủ 6 tháng

    // Không hoàn cọc nếu vi phạm một trong hai điều kiện.
    const isDepositForfeited = isEarlyNotice || isUnderMinStay;

    const warnings = [];
    if (isEarlyNotice) {
      warnings.push({
        type: "early_notice",
        message: `Ngày trả phòng của bạn đang cách ngày kết thúc hợp đồng ${daysBeforeContractEnd} ngày, chưa đủ tối thiểu ${MOVEOUT_POLICY.MIN_NOTICE_DAYS} ngày báo trước. Trường hợp này sẽ không được hoàn cọc. Bạn có chắc chắn không?`
      });
    }

    if (isUnderMinStay) {
      warnings.push({
        type: "under_min_stay",
        message: `Bạn sẽ không được hoàn cọc vì thời gian ở tính đến hiện tại là ${stayDaysToToday} ngày, chưa đủ tối thiểu ${minStayDays} ngày (6 tháng). Bạn có chắc chắn không?`
      });
    }

    if (warnings.length > 0 && !confirmContinue) {
      return {
        requiresConfirmation: true,
        warnings,
        data: {
          contractId: contract._id,
          expectedMoveOutDate: moveOutDate,
          daysNotice,
          daysBeforeContractEnd,
          stayMonths: stayMonthsToToday,
          stayDays: stayDaysToToday,
          stayMonthsToToday,
          stayDaysToToday,
          isEarlyNotice,
          isUnderMinStay,
          isDepositForfeited,
          minNoticeDays: MOVEOUT_POLICY.MIN_NOTICE_DAYS,
          minStayMonths: MOVEOUT_POLICY.MIN_STAY_MONTHS
        }
      };
    }

    console.log(`[MOVEOUT] NoticeToMoveOut: ${daysNotice} ngày, Stay@Today: ${stayMonthsToToday} tháng (${stayDaysToToday} ngày), DaysBeforeEnd: ${daysBeforeContractEnd}, Forfeited: ${isDepositForfeited}`);

    // 6. Tạo request
    const moveOutRequest = new MoveOutRequest({
      contractId,
      tenantId,
      expectedMoveOutDate: moveOutDate,
      reason,
      requestDate: now,
      isEarlyNotice,
      isUnderMinStay,
      isDepositForfeited,
      status: "Requested"
    });
    await moveOutRequest.save();

    // 7. Notify managers
    await this._notifyManagers(
      tenantId,
      contract,
      `📋 Yêu cầu trả phòng mới`,
      `Tenant yêu cầu trả phòng ${contract.roomId?.name || ''}.\nNgày trả dự kiến: ${this._formatVNDate(moveOutDate)}\nLý do: ${reason || 'Không có'}\n\nVui lòng kiểm tra phòng và phát hành hóa đơn cuối.`
    );

    console.log(`[MOVEOUT] ✅ Yêu cầu tạo thành công: ${moveOutRequest._id}`);
    return moveOutRequest;
  }

  async releaseFinalInvoice(moveOutRequestId, managerInvoiceNotes = "", electricIndex, waterIndex) {
    console.log(`[MOVEOUT] 📄 Manager phát hành hóa đơn cuối: ${moveOutRequestId}`);

    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");
    if (moveOutRequest.status !== "Requested")
      throw new Error(`Chỉ có thể phát hành hóa đơn khi trạng thái là Requested (hiện tại: ${moveOutRequest.status})`);

    const parsedElectricIndex = electricIndex !== undefined && electricIndex !== null
      ? Number(electricIndex)
      : undefined;
    const parsedWaterIndex = waterIndex !== undefined && waterIndex !== null
      ? Number(waterIndex)
      : undefined;

    if (parsedElectricIndex !== undefined && (!Number.isFinite(parsedElectricIndex) || parsedElectricIndex < 0)) {
      throw new Error("Chỉ số điện phải là số hợp lệ và không âm");
    }
    if (parsedWaterIndex !== undefined && (!Number.isFinite(parsedWaterIndex) || parsedWaterIndex < 0)) {
      throw new Error("Chỉ số nước phải là số hợp lệ và không âm");
    }

    if (parsedElectricIndex !== undefined) {
      console.log(`[MOVEOUT] 📊 Nhận chỉ số điện từ manager: ${parsedElectricIndex}`);
    }
    if (parsedWaterIndex !== undefined) {
      console.log(`[MOVEOUT] 📊 Nhận chỉ số nước từ manager: ${parsedWaterIndex}`);
    }
    if (parsedElectricIndex === undefined && parsedWaterIndex === undefined) {
      console.log(`[MOVEOUT] ℹ️ Sẽ dùng MeterReading gần nhất để tính điện/nước`);
    }

    const contract = await Contract.findById(moveOutRequest.contractId)
      .select("_id contractCode roomId depositId")
      .populate("roomId", "name");
    if (!contract) throw new Error("Không tìm thấy hợp đồng");

    // Tính chi phí chốt trước để quyết định có cần phát hành hóa đơn hay không.
    const finalInvoiceDraft = await this._createFinalInvoiceForContract(
      moveOutRequest.contractId,
      parsedElectricIndex,
      parsedWaterIndex,
      { persist: false }
    );

    let settlement = await this._calculateDepositSettlement(moveOutRequest, contract, finalInvoiceDraft);
    let finalInvoice = null;
    let refundTicket = null;

    // Trường hợp cọc dư: không phát hành hóa đơn cuối, chỉ tạo phiếu chi hoàn cọc.
    if (settlement.refundToTenant > 0) {
      refundTicket = await FinancialTicket.findOne({
        referenceId: moveOutRequest._id,
        title: { $regex: /^Hoàn cọc trả phòng/i }
      })
        .select("_id amount status paymentVoucher transactionDate")
        .sort({ createdAt: -1 });

      if (!refundTicket) {
        const paymentVoucher = await this._getNextMoveOutRefundVoucher();
        refundTicket = await FinancialTicket.create({
          amount: settlement.refundToTenant,
          title: `Hoàn cọc trả phòng - HĐ ${contract.contractCode || moveOutRequest.contractId}`,
          referenceId: moveOutRequest._id,
          status: "Approved",
          transactionDate: new Date(),
          accountantPaidAt: null,
          paymentVoucher
        });
      }

      const isRefundTicketPaid = refundTicket?.status === "Paid";

      moveOutRequest.finalInvoiceId = null;
      moveOutRequest.managerInvoiceNotes = managerInvoiceNotes;
      moveOutRequest.depositRefundAmount = settlement.refundToTenant;
      moveOutRequest.status = isRefundTicketPaid ? "Paid" : "InvoiceReleased";
      moveOutRequest.paymentDate = isRefundTicketPaid
        ? (moveOutRequest.paymentDate || new Date())
        : null;
      await moveOutRequest.save();

      settlement = {
        ...settlement,
        netInvoiceAmount: 0,
        appliedDepositOffset: settlement.recommendedDepositOffset,
        remainingToPay: 0,
        depositCoversInvoice: true
      };

      const grossInvoiceText = settlement.invoiceAmount.toLocaleString('vi-VN');
      const refundText = settlement.refundToTenant.toLocaleString('vi-VN');
      const voucherText = refundTicket?.paymentVoucher ? `\nMã phiếu chi hoàn cọc: ${refundTicket.paymentVoucher}` : "";

      await this._notifyTenant(
        moveOutRequest.tenantId,
        `📄 Kết quả tất toán trả phòng`,
        `Quản lý đã kiểm tra phòng ${contract?.roomId?.name || ''}.\nChi phí chốt: ${grossInvoiceText} VND\nKhoản này đã được cấn trừ toàn bộ từ tiền cọc nên không phát hành hóa đơn cuối.\nSố tiền cọc còn dư dự kiến hoàn: ${refundText} VND.${voucherText}`
      );

      console.log(`[MOVEOUT] ✅ Không phát hành hóa đơn cuối do cọc dư | Hoàn cọc: ${settlement.refundToTenant}`);
      return {
        moveOutRequest,
        finalInvoice: null,
        settlement,
        refundTicket: refundTicket
          ? {
              id: refundTicket._id,
              amount: refundTicket.amount,
              status: refundTicket.status,
              paymentVoucher: refundTicket.paymentVoucher,
              transactionDate: refundTicket.transactionDate
            }
          : null
      };
    }

    // Các trường hợp còn lại vẫn phát hành hóa đơn cuối.
    finalInvoice = await this._persistFinalInvoiceDraft(moveOutRequest.contractId, finalInvoiceDraft);

    // Cấn trừ tiền cọc ngay khi phát hành hóa đơn để xác định số tiền cần thanh toán thêm.
    settlement = await this._applyDepositOffsetIfNeeded(moveOutRequest, contract, finalInvoice);

    // Nếu cọc dư sau khi cấn trừ hóa đơn cuối thì tự động tạo phiếu chi hoàn cọc.
    if (settlement.refundToTenant > 0) {
      refundTicket = await FinancialTicket.findOne({
        referenceId: moveOutRequest._id,
        title: { $regex: /^Hoàn cọc trả phòng/i }
      })
        .select("_id amount status paymentVoucher transactionDate")
        .sort({ createdAt: -1 });

      if (!refundTicket) {
        const paymentVoucher = await this._getNextMoveOutRefundVoucher();
        refundTicket = await FinancialTicket.create({
          amount: settlement.refundToTenant,
          title: `Hoàn cọc trả phòng - HĐ ${contract.contractCode || moveOutRequest.contractId}`,
          referenceId: moveOutRequest._id,
          status: "Approved",
          transactionDate: new Date(),
          accountantPaidAt: null,
          paymentVoucher
        });
      }
    }

    const isAutoPaid = finalInvoice.status === "Paid";

    // Cập nhật request
    moveOutRequest.finalInvoiceId = finalInvoice._id;
    moveOutRequest.managerInvoiceNotes = managerInvoiceNotes;
    moveOutRequest.depositRefundAmount = settlement.refundToTenant;
    moveOutRequest.status = isAutoPaid ? "Paid" : "InvoiceReleased";
    moveOutRequest.paymentDate = isAutoPaid ? new Date() : null;
    await moveOutRequest.save();

    const targetDepositId = contract?.depositId || settlement.depositId;
    if (isAutoPaid && targetDepositId) {
      if (moveOutRequest.isDepositForfeited) {
        await Deposit.findByIdAndUpdate(targetDepositId, {
          status: "Forfeited",
          refundDate: null,
          forfeitedDate: new Date()
        });
      } else if (settlement.refundToTenant <= 0) {
        await Deposit.findByIdAndUpdate(targetDepositId, {
          status: "Refunded",
          refundDate: new Date(),
          forfeitedDate: null
        });
      }
    }

    // Notify tenant
    const grossInvoiceText = settlement.invoiceAmount.toLocaleString('vi-VN');
    const depositOffsetText = settlement.recommendedDepositOffset.toLocaleString('vi-VN');
    const remainingToPayText = settlement.remainingToPay.toLocaleString('vi-VN');
    const refundText = settlement.refundToTenant.toLocaleString('vi-VN');
    const voucherText = refundTicket?.paymentVoucher ? `\nMã phiếu chi hoàn cọc: ${refundTicket.paymentVoucher}` : "";

    const noticeContent = settlement.remainingToPay > 0
      ? `Quản lý đã kiểm tra phòng ${contract?.roomId?.name || ''} và phát hành hóa đơn cuối.\nTổng chi phí chốt: ${grossInvoiceText} VND\nĐã cấn trừ tiền cọc: ${depositOffsetText} VND\nCòn cần thanh toán thêm: ${remainingToPayText} VND\n\nVui lòng thanh toán phần còn thiếu để hoàn tất thủ tục trả phòng.`
      : `Quản lý đã kiểm tra phòng ${contract?.roomId?.name || ''} và phát hành hóa đơn cuối.\nTổng chi phí chốt: ${grossInvoiceText} VND\nĐã cấn trừ tiền cọc: ${depositOffsetText} VND\nBạn không cần thanh toán thêm hóa đơn cuối.${settlement.refundToTenant > 0 ? `\nSố tiền cọc còn dư dự kiến hoàn: ${refundText} VND.${voucherText}` : ''}`;

    await this._notifyTenant(
      moveOutRequest.tenantId,
      `📄 Hóa đơn cuối đã được phát hành`,
      noticeContent
    );

    console.log(`[MOVEOUT] ✅ Hóa đơn cuối đã tạo và liên kết: ${finalInvoice._id} | Còn cần thanh toán: ${settlement.remainingToPay}`);
    return {
      moveOutRequest,
      finalInvoice,
      settlement,
      refundTicket: refundTicket
        ? {
            id: refundTicket._id,
            amount: refundTicket.amount,
            status: refundTicket.status,
            paymentVoucher: refundTicket.paymentVoucher,
            transactionDate: refundTicket.transactionDate
          }
        : null
    };
  }

  // ============================================================
  //  HELPER – Tạo hóa đơn cuối cho hợp đồng (lưu vào invoice_periodics)
  // ============================================================
  /**
   * Tạo hóa đơn cuối khi tenant trả phòng
   * 
   * LOGIC XỬ LÝ TIỆN ÍCH (ĐIỆN/NƯỚC):
   * ================================
   * 1. Lấy chỉ số gần nhất từ MeterReading (reading.newIndex)
   * 2. Nếu manager nhập chỉ số mới (electricIndex, waterIndex):
   *    - oldIndex = newIndex của lần gần nhất (reading.newIndex)
   *    - newIndex = chỉ số manager nhập lên
   *    - Lưu MeterReading mới với chỉ số này
   * 3. Nếu không nhập:
   *    - Sử dụng oldIndex và newIndex từ reading gần nhất
   * 4. Usage = newIndex - oldIndex (không tính nếu <= 0)
   * 5. Amount = usage * giá tiện ích
   * 
   * CÁCH HOẠT ĐỘNG CỦA METER READING:
   * - Mỗi lần đọc chỉ số, tạo record: {oldIndex, newIndex, usageAmount, readingDate}
   * - oldIndex là chỉ số từ lần gần nhất trước đó
   * - newIndex là chỉ số hiện tại
   * - Lần trả phòng: newIndex của lần cũ trở thành oldIndex của lần mới
   * 
   * @param {String} contractId - ID hợp đồng
   * @param {Number} electricIndex - Chỉ số điện manager nhập (optional)
   * @param {Number} waterIndex - Chỉ số nước manager nhập (optional)
   * @returns {InvoicePeriodic} Hóa đơn cuối
   */
  async _createFinalInvoiceForContract(contractId, electricIndex, waterIndex, options = {}) {
    console.log(`[MOVEOUT] 📋 Tạo hóa đơn cuối cho contract: ${contractId}`);
    const { persist = true } = options;

    const contract = await Contract.findById(contractId)
      .populate({ path: 'roomId', populate: { path: 'roomTypeId' } });
    if (!contract) throw new Error("Không tìm thấy hợp đồng");

    const room = contract.roomId;
    if (!room) throw new Error("Hợp đồng không có thông tin phòng");

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    const moveOutDate = now; // Dùng ngày hiện tại làm ngày chốt
    const dueDate = new Date(year, month, 5);
    const invoiceCode = `INV-${contract.contractCode}-${month}${year}`;
    const invoiceTitle = `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`;

    // Nếu đã có hóa đơn cùng kỳ cho hợp đồng này thì cập nhật lại item theo dữ liệu chốt mới.
    const existingFinal = persist
      ? await InvoicePeriodic.findOne({ invoiceCode, contractId: contract._id })
      : null;

    let parsedPrice = room.roomTypeId?.currentPrice || 0;
    parsedPrice = typeof parsedPrice === 'object' && parsedPrice.$numberDecimal
      ? parseFloat(parsedPrice.$numberDecimal)
      : Number(parsedPrice) || 0;

    const invoiceItems = [];
    let totalAmount = 0;

    // ---- 1. Tiền phòng còn lại tới ngày xuất phòng ----
    const startBilling = contract.rentPaidUntil
      ? new Date(new Date(contract.rentPaidUntil).getTime() + 24 * 60 * 60 * 1000) // ngày sau rentPaidUntil
      : new Date(contract.startDate);
    startBilling.setHours(0, 0, 0, 0);

    const endBilling = new Date(moveOutDate);
    endBilling.setHours(23, 59, 59, 0);

    const formatVN = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

    if (startBilling <= endBilling) {
      let tempStart = new Date(startBilling);
      let fullMonths = 0;
      
      while (true) {
        let nextMonth = new Date(tempStart);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        let endOfCycle = new Date(nextMonth);
        endOfCycle.setDate(endOfCycle.getDate() - 1);

        if (endOfCycle <= endBilling) {
            fullMonths++;
            tempStart = nextMonth;
        } else {
            break;
        }
      }
      
      const oddDays = Math.round((endBilling - tempStart) / (1000 * 60 * 60 * 24)) + 1;
      const daysInTargetMonth = new Date(endBilling.getFullYear(), endBilling.getMonth() + 1, 0).getDate();
      
      const pricePerDay = parsedPrice / daysInTargetMonth;
      const roomRentAmount = (fullMonths * parsedPrice) + (oddDays * pricePerDay);

      let periodText = "";
      if (fullMonths > 0 && oddDays > 0) {
          periodText = `${fullMonths} tháng và ${oddDays} ngày lẻ`;
      } else if (fullMonths > 0) {
          periodText = `${fullMonths} tháng`;
      } else if (oddDays > 0) {
          periodText = `${oddDays} ngày lẻ`;
      }

      invoiceItems.push({
        itemName: `Tiền thuê phòng xuất phòng (${periodText} từ ${formatVN(startBilling)} đến ${formatVN(endBilling)})`,
        usage: 1,
        unitPrice: roomRentAmount,
        amount: roomRentAmount,
        isIndex: false
      });
      totalAmount += roomRentAmount;
      console.log(`[MOVEOUT] Tiền phòng: ${periodText} = ${roomRentAmount}`);
    } else {
      invoiceItems.push({
        itemName: `Tiền thuê phòng (Đã thanh toán trước đến ${contract.rentPaidUntil ? formatVN(new Date(contract.rentPaidUntil)) : formatVN(endBilling)})`,
        usage: 1,
        unitPrice: 0,
        amount: 0,
        isIndex: false
      });
    }

    // ---- 2. Điện / Nước: theo logic invoice_periodic ----
    const recentReadings = await MeterReading.find({
      roomId: room._id,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    })
      .sort({ createdAt: -1 })
      .populate('utilityId');

    const readingsForCalc = recentReadings.length > 0
      ? recentReadings
      : await MeterReading.find({ roomId: room._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('utilityId');

    const latestReadings = {};
    const normalizeUtilityName = (value = "") => value
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    readingsForCalc.forEach(reading => {
      if (!reading.utilityId) return;
      const uId = reading.utilityId._id.toString();
      if (!latestReadings[uId]) {
        const usage = reading.newIndex - reading.oldIndex;
        if (usage >= 0 && reading.utilityId) {
          latestReadings[uId] = {
            utilityId: reading.utilityId,
            oldIndex: reading.oldIndex,
            newIndex: reading.newIndex,
            totalUsage: usage
          };
        }
      }
    });

    if (recentReadings.length === 0 && readingsForCalc.length > 0) {
      console.log(`[MOVEOUT] ℹ️ Không có reading trong tháng hiện tại, dùng reading gần nhất để tính`);
    }

    console.log(`[MOVEOUT] 📊 Readings dùng để tính: ${Object.keys(latestReadings).length} utilities`);

    const utilityTypeMap = {
      electric: null,
      water: null
    };

    Object.values(latestReadings).forEach((group) => {
      if (!group?.utilityId) return;
      const normalizedName = normalizeUtilityName(group.utilityId.name || group.utilityId.serviceName || "");
      if (normalizedName === 'dien' && !utilityTypeMap.electric) {
        utilityTypeMap.electric = group.utilityId;
      }
      if (normalizedName === 'nuoc' && !utilityTypeMap.water) {
        utilityTypeMap.water = group.utilityId;
      }
    });

    // Nếu frontend gửi chỉ số mới thì luôn ghi MeterReading với oldIndex = newIndex lần trước.
    if (electricIndex !== undefined || waterIndex !== undefined) {
      const [electricService, waterService] = await Promise.all([
        Service.findOne({ name: { $regex: /^(điện|dien)$/i } }),
        Service.findOne({ name: { $regex: /^(nước|nuoc)$/i } })
      ]);

      const manualInputs = [
        {
          type: 'electric',
          label: 'điện',
          inputIndex: electricIndex,
          fallbackService: electricService
        },
        {
          type: 'water',
          label: 'nước',
          inputIndex: waterIndex,
          fallbackService: waterService
        }
      ].filter((item) => item.inputIndex !== undefined);

      for (const manualInput of manualInputs) {
        const utilityDoc = utilityTypeMap[manualInput.type] || manualInput.fallbackService;
        if (!utilityDoc?._id) {
          throw new Error(`Không tìm thấy dịch vụ ${manualInput.label} để cập nhật chỉ số`);
        }

        const utilityId = utilityDoc._id.toString();
        const latestUtilityReading = await MeterReading.findOne({
          roomId: room._id,
          utilityId
        })
          .sort({ readingDate: -1, createdAt: -1 })
          .populate('utilityId');

        const previousIndexValue = Number(latestUtilityReading?.newIndex);
        const finalOldIndex = Number.isFinite(previousIndexValue) && previousIndexValue >= 0
          ? previousIndexValue
          : 0;
        const finalNewIndex = Number(manualInput.inputIndex);

        if (finalNewIndex < finalOldIndex) {
          throw new Error(
            `Chỉ số ${manualInput.label} mới (${finalNewIndex}) không thể nhỏ hơn chỉ số cũ (${finalOldIndex})`
          );
        }

        const usage = finalNewIndex - finalOldIndex;
        await MeterReading.create({
          roomId: room._id,
          utilityId,
          oldIndex: finalOldIndex,
          newIndex: finalNewIndex,
          usageAmount: usage,
          readingDate: moveOutDate
        });

        const utilityForCalc = latestUtilityReading?.utilityId || utilityDoc;
        latestReadings[utilityId] = {
          utilityId: utilityForCalc,
          oldIndex: finalOldIndex,
          newIndex: finalNewIndex,
          totalUsage: usage,
          isManualInput: true
        };

        console.log(
          `[MOVEOUT] ✅ Lưu MeterReading ${manualInput.label}: ${finalOldIndex} → ${finalNewIndex} (usage: ${usage})`
        );
      }
    }

    // Xử lý từng utility để đưa vào item hóa đơn
    for (const group of Object.values(latestReadings)) {
      const utilityName = group.utilityId.name || group.utilityId.serviceName || '';
      const finalOldIndex = Number(group.oldIndex) || 0;
      const finalNewIndex = Number(group.newIndex) || 0;
      const usage = Number(group.totalUsage) || 0;

      if (usage <= 0) {
        if (group.isManualInput) {
          console.log(`[MOVEOUT] ℹ️ ${utilityName}: usage = ${usage}, không phát sinh tiền`);
        }
        continue;
      }

      let servicePrice = group.utilityId.currentPrice || group.utilityId.price || 0;
      servicePrice = typeof servicePrice === 'object' && servicePrice.$numberDecimal
        ? parseFloat(servicePrice.$numberDecimal)
        : Number(servicePrice) || 0;

      const amount = usage * servicePrice;
      totalAmount += amount;

      invoiceItems.push({
        itemName: `Tiền ${utilityName.toLowerCase()}`,
        oldIndex: finalOldIndex,
        newIndex: finalNewIndex,
        usage,
        unitPrice: servicePrice,
        amount,
        isIndex: true
      });

      console.log(`[MOVEOUT] 🔌 ${utilityName}: ${finalOldIndex} → ${finalNewIndex} (${usage} x ${servicePrice} = ${amount})`);
    }

    // ---- 3. Dịch vụ mở rộng từ BookService: lấy đầy đủ dịch vụ theo contract ----
    const contractBookServices = await BookService.find({ contractId: contract._id })
      .populate('services.serviceId');

    const bookServiceItems = contractBookServices.flatMap((bookServiceDoc) =>
      Array.isArray(bookServiceDoc.services) ? bookServiceDoc.services : []
    );

    if (bookServiceItems.length > 0) {
      const moveOutDay = new Date(moveOutDate);
      moveOutDay.setHours(23, 59, 59, 999);

      const serviceChargeMap = new Map();

      bookServiceItems.forEach((srvItem) => {
        if (!srvItem?.serviceId) {
          return;
        }

        const startDate = srvItem.startDate ? new Date(srvItem.startDate) : null;
        const endDate = srvItem.endDate ? new Date(srvItem.endDate) : null;

        if (startDate) {
          startDate.setHours(0, 0, 0, 0);
          if (startDate > moveOutDay) {
            return;
          }
        }

        if (endDate) {
          endDate.setHours(23, 59, 59, 999);
          if (endDate < moveOutDay) {
            return;
          }
        }

        const srvItemName = srvItem.serviceId.name || srvItem.serviceId.serviceName || "Dịch vụ";
        const nameCheck = srvItemName.toLowerCase().trim();

        // Điện/Nước đã được xử lý ở khối utility bên trên.
        if (nameCheck === 'điện' || nameCheck === 'dien' || nameCheck === 'nước' || nameCheck === 'nuoc') {
          return;
        }

        let srvPrice = srvItem.serviceId.currentPrice || srvItem.serviceId.price || 0;
        srvPrice = typeof srvPrice === 'object' && srvPrice.$numberDecimal
          ? parseFloat(srvPrice.$numberDecimal)
          : Number(srvPrice);

        if (!Number.isFinite(srvPrice) || srvPrice < 0) {
          return;
        }

        const finalQty = Number(srvItem.quantity) || 1;
        if (!Number.isFinite(finalQty) || finalQty <= 0) {
          return;
        }

        const serviceKey = srvItem.serviceId._id
          ? srvItem.serviceId._id.toString()
          : `${srvItemName}-${finalQty}-${srvPrice}`;

        const existing = serviceChargeMap.get(serviceKey);
        if (!existing || ((existing.startDate || 0) < (startDate || 0))) {
          serviceChargeMap.set(serviceKey, {
            itemName: srvItemName,
            quantity: finalQty,
            unitPrice: srvPrice,
            startDate
          });
        }
      });

      let totalBookServiceItems = 0;
      for (const chargeItem of serviceChargeMap.values()) {
        const amount = chargeItem.quantity * chargeItem.unitPrice;
        totalAmount += amount;
        totalBookServiceItems += 1;

        invoiceItems.push({
          itemName: `Dịch vụ ${chargeItem.itemName}`,
          oldIndex: 0,
          newIndex: 0,
          usage: chargeItem.quantity,
          unitPrice: chargeItem.unitPrice,
          amount,
          isIndex: false
        });
      }

      console.log(`[MOVEOUT] 📦 Đã thêm ${totalBookServiceItems} item dịch vụ từ BookService (nguồn: ${bookServiceItems.length} bản ghi)`);
    } else {
      console.log(`[MOVEOUT] ℹ️ Không có BookService cho contract này`);
    }

    if (!persist) {
      return {
        invoiceCode,
        contractId: contract._id,
        title: invoiceTitle,
        items: invoiceItems,
        totalAmount,
        dueDate,
        status: 'Unpaid'
      };
    }

    // ---- Lưu vào invoice_periodics với status Unpaid (phát hành ngay) ----
    if (existingFinal) {
      if (existingFinal.status === 'Paid') {
        throw new Error('Hóa đơn tháng này đã được thanh toán, không thể cập nhật lại dữ liệu trả phòng.');
      }

      existingFinal.title = invoiceTitle;
      existingFinal.items = invoiceItems;
      existingFinal.totalAmount = totalAmount;
      existingFinal.dueDate = dueDate;
      existingFinal.status = 'Unpaid';

      await existingFinal.save();
      console.log(`[MOVEOUT] ✅ Hóa đơn cuối đã cập nhật: ${existingFinal._id} | Tổng: ${totalAmount}`);
      return existingFinal;
    }

    const finalInvoice = new InvoicePeriodic({
      invoiceCode,
      contractId,
      title: invoiceTitle,
      items: invoiceItems,
      totalAmount,
      dueDate,
      status: 'Unpaid' // Phát hành ngay, không qua Draft
    });

    await finalInvoice.save();
    console.log(`[MOVEOUT] ✅ Hóa đơn cuối đã lưu: ${finalInvoice._id} | Tổng: ${totalAmount}`);
    return finalInvoice;
  }

  // ============================================================
  //  STEP 3 – So sánh tiền cọc vs hóa đơn cuối
  // ============================================================
  async getDepositVsInvoice(moveOutRequestId) {
    console.log(`[MOVEOUT] 🔍 So sánh cọc vs hóa đơn: ${moveOutRequestId}`);

    await this._syncMoveOutByRequestId(moveOutRequestId);
    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");

    const contract = await Contract.findById(moveOutRequest.contractId);
    if (!contract) throw new Error("Không tìm thấy hợp đồng");

    const refundTicket = await FinancialTicket.findOne({
      referenceId: moveOutRequest._id,
      title: { $regex: /^Hoàn cọc trả phòng/i }
    })
      .select("_id amount status paymentVoucher transactionDate")
      .sort({ createdAt: -1 })
      .lean();

    if (!moveOutRequest.finalInvoiceId) {
      const deposit = await this._findDepositForContract(contract);
      const linkedDepositId = contract?.depositId ? String(contract.depositId) : null;

      let depositId = null;
      let depositStatus = null;
      let depositAmount = 0;
      let usableDepositAmount = 0;
      let isLinkedToContract = false;

      if (deposit) {
        depositId = deposit._id;
        depositStatus = deposit.status;
        depositAmount = Number(deposit.amount) || 0;
        isLinkedToContract = Boolean(
          linkedDepositId && depositId && String(depositId) === linkedDepositId
        );
        if (this._isDepositUsableForSettlement(deposit.status, { isLinkedToContract })) {
          usableDepositAmount = depositAmount;
        }
      }

      const isDepositForfeited = Boolean(moveOutRequest?.isDepositForfeited);
      const effectiveUsableDeposit = isDepositForfeited ? 0 : usableDepositAmount;
      const refundToTenant = Math.max(Number(moveOutRequest.depositRefundAmount) || 0, 0);
      const invoiceAmount = Math.max(effectiveUsableDeposit - refundToTenant, 0);

      return {
        depositId,
        depositStatus,
        isLinkedToContract,
        depositAmount,
        usableDepositAmount,
        invoiceAmount,
        netInvoiceAmount: 0,
        appliedDepositOffset: invoiceAmount,
        recommendedDepositOffset: invoiceAmount,
        depositCoversInvoice: true,
        remainingToPay: 0,
        refundToTenant,
        isDepositForfeited,
        refundTicket
      };
    }

    const finalInvoice = await InvoicePeriodic.findById(moveOutRequest.finalInvoiceId);
    if (!finalInvoice) throw new Error("Không tìm thấy hóa đơn cuối");

    const settlement = await this._applyDepositOffsetIfNeeded(moveOutRequest, contract, finalInvoice);

    return {
      ...settlement,
      refundTicket
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
      .select("_id status depositId roomId");
    if (!contract) {
      throw new Error("Không tìm thấy hợp đồng");
    }

    const deposit = await this._findDepositForContract(contract);
    if (deposit?._id) {
      if (moveOutRequest.isDepositForfeited) {
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

    if (contract.status !== "terminated") {
      contract.status = "terminated";
      await contract.save();
    }

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

    moveOutRequest.status = "Completed";
    moveOutRequest.completedDate = new Date();
    moveOutRequest.managerCompletionNotes = managerCompletionNotes;
    await moveOutRequest.save();

    await this._notifyTenant(
      moveOutRequest.tenantId,
      `✅ Trả phòng đã hoàn tất`,
      `Quản lý đã xác nhận hoàn tất quy trình trả phòng.${managerCompletionNotes ? `\nGhi chú: ${managerCompletionNotes}` : ""}`
    );

    return moveOutRequest;
  }

  // ============================================================
  //  READ – Lấy danh sách / chi tiết
  // ============================================================
  async getMoveOutRequestById(moveOutRequestId) {
    await this._syncMoveOutByRequestId(moveOutRequestId);

    const req = await MoveOutRequest.findById(moveOutRequestId)
      .populate('finalInvoiceId', 'invoiceCode totalAmount status dueDate')
      .populate({
        path: 'contractId',
        select: 'contractCode startDate endDate depositId roomId',
        populate: { path: 'roomId', select: 'name roomCode' }
      });

    if (!req) throw new Error("Không tìm thấy yêu cầu trả phòng");
    return req;
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
        select: 'roomId startDate endDate contractCode status depositId',
        populate: { path: 'roomId', select: 'name roomCode floorId' }
      })
      .populate('tenantId', 'email phoneNumber username')
      .populate('finalInvoiceId', 'invoiceCode totalAmount status dueDate')
      .sort({ requestDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await MoveOutRequest.countDocuments(query);

    // Enrich với fullname từ UserInfo
    const tenantIds = moveOutRequests
      .filter(r => r.tenantId?._id)
      .map(r => r.tenantId._id);

    const userInfoList = await UserInfo.find({ userId: { $in: tenantIds } }).select('userId fullname');
    const userInfoMap = {};
    userInfoList.forEach(ui => { userInfoMap[ui.userId.toString()] = ui.fullname; });

    const enriched = moveOutRequests.map(r => {
      const obj = r.toObject();
      if (obj.tenantId?._id) {
        obj.tenantId.fullName = userInfoMap[obj.tenantId._id.toString()] || '';
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
