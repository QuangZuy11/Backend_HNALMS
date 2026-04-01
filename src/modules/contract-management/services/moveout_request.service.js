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

const MOVEOUT_POLICY = {
  MIN_NOTICE_DAYS: 30,
  MIN_STAY_MONTHS: 3
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

  // ============================================================
  //  STEP 1 – Tenant tạo yêu cầu trả phòng
  // ============================================================
  /**
   * Kiểm tra + tạo MoveOutRequest
   * Rule (từ flowchart):
  *  - expectedMoveOutDate phải < contract.endDate
  *  - Đủ điều kiện hoàn cọc nếu:
  *      + Thời gian thuê tính từ startDate đến hiện tại >= 3 tháng (quy đổi tối thiểu 90 ngày)
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
    const isUnderMinStay = !hasEnoughStayDays; // thuê chưa đủ 3 tháng

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
        message: `Bạn sẽ không được hoàn cọc vì thời gian ở tính đến hiện tại là ${stayDaysToToday} ngày, chưa đủ tối thiểu ${minStayDays} ngày (3 tháng). Bạn có chắc chắn không?`
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

    // Tự tạo hóa đơn cuối vào invoice_periodics
    const finalInvoice = await this._createFinalInvoiceForContract(
      moveOutRequest.contractId,
      parsedElectricIndex,
      parsedWaterIndex
    );

    // Cập nhật request
    moveOutRequest.finalInvoiceId = finalInvoice._id;
    moveOutRequest.managerInvoiceNotes = managerInvoiceNotes;
    moveOutRequest.status = "InvoiceReleased";
    await moveOutRequest.save();

    // Notify tenant
    const contract = await Contract.findById(moveOutRequest.contractId).populate('roomId', 'name');
    await this._notifyTenant(
      moveOutRequest.tenantId,
      `📄 Hóa đơn cuối đã được phát hành`,
      `Quản lý đã kiểm tra phòng ${contract?.roomId?.name || ''} và phát hành hóa đơn cuối.\nTổng tiền: ${finalInvoice.totalAmount.toLocaleString('vi-VN')} VND\n\nVui lòng thanh toán để hoàn tất thủ tục trả phòng.`
    );

    console.log(`[MOVEOUT] ✅ Hóa đơn cuối đã tạo và liên kết: ${finalInvoice._id}`);
    return { moveOutRequest, finalInvoice };
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
  async _createFinalInvoiceForContract(contractId, electricIndex, waterIndex) {
    console.log(`[MOVEOUT] 📋 Tạo hóa đơn cuối cho contract: ${contractId}`);

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
    const existingFinal = await InvoicePeriodic.findOne({ invoiceCode, contractId: contract._id });

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

    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");
    if (!moveOutRequest.finalInvoiceId)
      throw new Error("Hóa đơn cuối chưa được phát hành");

    const contract = await Contract.findById(moveOutRequest.contractId);
    if (!contract) throw new Error("Không tìm thấy hợp đồng");

    const finalInvoice = await InvoicePeriodic.findById(moveOutRequest.finalInvoiceId);
    if (!finalInvoice) throw new Error("Không tìm thấy hóa đơn cuối");

    // Lấy tiền cọc
    let depositAmount = 0;
    let depositId = null;
    if (contract.depositId) {
      const deposit = await Deposit.findById(contract.depositId);
      if (deposit && deposit.status === 'Held') {
        depositAmount = deposit.amount;
        depositId = deposit._id;
      }
    }

    const invoiceAmount = finalInvoice.totalAmount;
    const depositCoversInvoice = depositAmount >= invoiceAmount;
    const remainingToPay = depositCoversInvoice ? 0 : invoiceAmount - depositAmount;
    const refundToTenant = depositCoversInvoice ? depositAmount - invoiceAmount : 0;
    const isDepositForfeited = moveOutRequest.isDepositForfeited;

    return {
      depositId,
      depositAmount,
      invoiceAmount,
      depositCoversInvoice,
      remainingToPay,
      // Nếu cọc bị forfeited: không hoàn phần thừa
      refundToTenant: isDepositForfeited ? 0 : refundToTenant,
      isDepositForfeited
    };
  }

  // ============================================================
  //  STEP 4 – Manager kiểm tra trạng thái thanh toán
  // ============================================================
  /**
   * Manager kiểm tra xem tenant đã thanh toán thành công hay chưa
   * Nếu hóa đơn status = 'Paid' → có thể hoàn tất trả phòng
   */
  async checkPaymentStatus(moveOutRequestId) {
    console.log(`[MOVEOUT] 🔍 Manager kiểm tra trạng thái thanh toán: ${moveOutRequestId}`);

    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");
    if (moveOutRequest.status !== "InvoiceReleased")
      throw new Error(`Chỉ có thể kiểm tra thanh toán khi status là InvoiceReleased (hiện tại: ${moveOutRequest.status})`);

    const finalInvoice = await InvoicePeriodic.findById(moveOutRequest.finalInvoiceId);
    if (!finalInvoice) throw new Error("Không tìm thấy hóa đơn cuối");

    const isPaid = finalInvoice.status === 'Paid';

    if (isPaid) {
      // Tenant đã thanh toán thành công → cập nhật trạng thái
      moveOutRequest.status = "Paid";
      moveOutRequest.paymentDate = new Date();
      await moveOutRequest.save();

      // Xử lý cọc
      const contract = await Contract.findById(moveOutRequest.contractId);
      if (contract?.depositId) {
        const depositStatus = moveOutRequest.isDepositForfeited ? "Forfeited" : "Refunded";
        await Deposit.findByIdAndUpdate(contract.depositId, {
          status: depositStatus,
          refundDate: moveOutRequest.isDepositForfeited ? null : new Date(),
          forfeitedDate: moveOutRequest.isDepositForfeited ? new Date() : null
        });
      }

      console.log(`[MOVEOUT] ✅ Tenant đã thanh toán thành công`);
    } else {
      console.log(`[MOVEOUT] ⏳ Tenant chưa thanh toán`);
    }

    return {
      moveOutRequestId,
      invoiceStatus: finalInvoice.status,
      isPaid,
      invoiceAmount: finalInvoice.totalAmount,
      message: isPaid ? "Tenant đã thanh toán. Manager có thể hoàn tất trả phòng." : "Tenant chưa thanh toán. Vui lòng chờ hoặc liên hệ tenant."
    };
  }

  // ============================================================
  //  STEP 5 – Manager hoàn tất trả phòng → Terminate contract
  // ============================================================
  async completeMoveOut(moveOutRequestId, managerCompletionNotes = "") {
    console.log(`[MOVEOUT] 🏁 Manager hoàn tất trả phòng: ${moveOutRequestId}`);

    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");
    if (moveOutRequest.status !== "Paid")
      throw new Error(`Chỉ hoàn tất được khi trạng thái là Paid (hiện tại: ${moveOutRequest.status})`);

    // 1. Hoàn tất request
    moveOutRequest.status = "Completed";
    moveOutRequest.completedDate = new Date();
    moveOutRequest.managerCompletionNotes = managerCompletionNotes;
    await moveOutRequest.save();

    // 2. Terminate contract
    const contract = await Contract.findById(moveOutRequest.contractId);
    if (contract) {
      contract.status = "terminated";
      await contract.save();
      console.log(`[MOVEOUT] ✅ Hợp đồng đã terminate`);
    }

    // 3. Vô hiệu hóa tài khoản tenant
    const tenant = await User.findById(moveOutRequest.tenantId);
    if (tenant) {
      tenant.status = "inactive";
      await tenant.save();
      console.log(`[MOVEOUT] ✅ Tài khoản tenant đã inactive`);
    }

    // 4. Notify tenant
    await this._notifyTenant(
      moveOutRequest.tenantId,
      `🎉 Trả phòng hoàn tất`,
      `Quản lý đã xác nhận hoàn tất quá trình trả phòng.\nGhi chú: ${managerCompletionNotes || 'Không có'}\n\nCảm ơn bạn đã sử dụng dịch vụ!`
    );

    console.log(`[MOVEOUT] ✅ Hoàn tất trả phòng thành công`);
    return moveOutRequest;
  }

  // ============================================================
  //  READ – Lấy danh sách / chi tiết
  // ============================================================
  async getMoveOutRequestById(moveOutRequestId) {
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
    const req = await MoveOutRequest.findOne({ contractId })
      .populate('finalInvoiceId', 'invoiceCode totalAmount status dueDate');
    if (!req) {
      console.log(`[MOVEOUT] Không có request cho contract: ${contractId}`);
      return null;
    }
    console.log(`[MOVEOUT] ✅ Tìm thấy: ${req._id}`);
    return req;
  }

  async getAllMoveOutRequests(status, page = 1, limit = 20) {
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
