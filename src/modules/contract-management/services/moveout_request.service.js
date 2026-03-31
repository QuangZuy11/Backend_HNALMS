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

class MoveOutRequestService {
  // ============================================================
  //  STEP 1 – Tenant tạo yêu cầu trả phòng
  // ============================================================
  /**
   * Kiểm tra + tạo MoveOutRequest
   * Rule (từ flowchart):
   *  - expectedMoveOutDate phải < contract.endDate
   *  - Đủ điều kiện hoàn cọc nếu: notice >= 30 ngày VÀ thời gian thuê >= 6 tháng
   */
  async createMoveOutRequest(contractId, tenantId, expectedMoveOutDate, reason) {
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
    const moveOutDate = new Date(expectedMoveOutDate);
    const endDate = new Date(contract.endDate);

    if (moveOutDate >= endDate) {
      throw new Error(
        `Ngày trả phòng (${moveOutDate.toLocaleDateString('vi-VN')}) phải nhỏ hơn ngày kết thúc hợp đồng (${endDate.toLocaleDateString('vi-VN')})`
      );
    }

    // 5. Tính điều kiện hoàn cọc (từ flowchart)
    const now = new Date();
    const daysNotice = Math.floor((moveOutDate - now) / (1000 * 60 * 60 * 24));
    const isEarlyNotice = daysNotice < 30; // báo gấp dưới 30 ngày

    const stayMonths = Math.floor(
      (moveOutDate - new Date(contract.startDate)) / (1000 * 60 * 60 * 24 * 30)
    );
    const isUnderMinStay = stayMonths < 6; // thuê chưa đủ 6 tháng

    // Mất cọc nếu báo gấp HOẶC chưa đủ 6 tháng
    const isDepositForfeited = isEarlyNotice || isUnderMinStay;

    console.log(`[MOVEOUT] Notice: ${daysNotice} ngày, Stay: ${stayMonths} tháng, Forfeited: ${isDepositForfeited}`);

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
      `Tenant yêu cầu trả phòng ${contract.roomId?.name || ''}.\nNgày trả dự kiến: ${moveOutDate.toLocaleDateString('vi-VN')}\nLý do: ${reason || 'Không có'}\n\nVui lòng kiểm tra phòng và phát hành hóa đơn cuối.`
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

    // Tự tạo hóa đơn cuối vào invoice_periodics
    const finalInvoice = await this._createFinalInvoiceForContract(moveOutRequest.contractId, electricIndex, waterIndex);

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
  async _createFinalInvoiceForContract(contractId, electricIndex, waterIndex) {
    console.log(`[MOVEOUT] 📋 Tạo hóa đơn cuối cho contract: ${contractId}`);

    const contract = await Contract.findById(contractId)
      .populate({ path: 'roomId', populate: { path: 'roomTypeId' } });
    if (!contract) throw new Error("Không tìm thấy hợp đồng");

    const room = contract.roomId;
    if (!room) throw new Error("Hợp đồng không có thông tin phòng");

    // Kiểm tra đã có hóa đơn cuối cho hợp đồng này trong invoice_periodics chưa
    const existingFinal = await InvoicePeriodic.findOne({
      contractId,
      title: { $regex: 'Hóa đơn xuất phòng', $options: 'i' }
    });
    if (existingFinal) {
      console.log(`[MOVEOUT] ⚠️ Hóa đơn cuối đã tồn tại: ${existingFinal._id}`);
      return existingFinal;
    }

    const now = new Date();
    const moveOutDate = now; // Dùng ngày hiện tại làm ngày chốt
    const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 5); // Hạn thanh toán: mồng 5 tháng sau

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
      const roomRentAmount = Math.round((fullMonths * parsedPrice) + (oddDays * pricePerDay));

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

    // ---- 2. Điện / Nước: lấy chỉ số điện/nước cuối cùng ----
    const Service = require("../../service-management/models/service.model");
    const elecService = await Service.findOne({ name: { $regex: /điện|dien/i } });
    const waterService = await Service.findOne({ name: { $regex: /nước|nuoc/i } });

    const latestReadings = await MeterReading.find({ roomId: room._id })
      .sort({ createdAt: -1 })
      .populate('utilityId');

    const processedUtilities = new Set();
    const utilityServices = [];

    for (const reading of latestReadings) {
      if (!reading.utilityId) continue;
      const uId = reading.utilityId._id.toString();
      if (processedUtilities.has(uId)) continue;
      processedUtilities.add(uId);
      utilityServices.push({ utilityId: reading.utilityId, reading });
    }

    if (elecService && !processedUtilities.has(elecService._id.toString())) {
       processedUtilities.add(elecService._id.toString());
       utilityServices.push({ utilityId: elecService, reading: null });
    }
    if (waterService && !processedUtilities.has(waterService._id.toString())) {
       processedUtilities.add(waterService._id.toString());
       utilityServices.push({ utilityId: waterService, reading: null });
    }

    for (const item of utilityServices) {
      const utilityId = item.utilityId;
      const reading = item.reading;

      const serviceNameLower = (utilityId.name || '').toLowerCase();
      
      let finalOldIndex = reading ? reading.oldIndex : 0;
      let finalNewIndex = reading ? reading.newIndex : 0;
      let isInputted = false;

      // Nếu có truyền chỉ số lên, coi số mới nhất gần đây (hoặc 0) là số cũ
      if ((serviceNameLower.includes('điện') || serviceNameLower.includes('dien')) && typeof electricIndex === 'number') {
        finalOldIndex = reading ? reading.newIndex : 0;
        finalNewIndex = electricIndex;
        isInputted = true;
      } else if ((serviceNameLower.includes('nước') || serviceNameLower.includes('nuoc')) && typeof waterIndex === 'number') {
        finalOldIndex = reading ? reading.newIndex : 0;
        finalNewIndex = waterIndex;
        isInputted = true;
      }

      const usage = finalNewIndex - finalOldIndex;
      if (usage < 0) {
        console.warn(`[MOVEOUT] Chỉ số mới ${finalNewIndex} nhỏ hơn chỉ số cũ ${finalOldIndex} cho tiện ích ${utilityId.name}`);
        continue;
      }
      if (usage === 0) continue;

      // Lưu MeterReading nếu quản lý nhập số liệu mới khi đóng băng/trả phòng
      if (isInputted && (!reading || finalNewIndex !== reading.newIndex)) {
        const newMeterReading = new MeterReading({
          roomId: room._id,
          utilityId: utilityId._id,
          oldIndex: finalOldIndex,
          newIndex: finalNewIndex,
          usageAmount: usage,
          readingDate: new Date()
        });
        await newMeterReading.save();
      }

      let servicePrice = utilityId.currentPrice || utilityId.price || 0;
      servicePrice = typeof servicePrice === 'object' && servicePrice.$numberDecimal
        ? parseFloat(servicePrice.$numberDecimal)
        : Number(servicePrice) || 0;

      const amount = Math.round(usage * servicePrice);
      totalAmount += amount;
      const serviceName = utilityId.name || 'Dịch vụ';

      invoiceItems.push({
        itemName: `Tiền ${serviceName.toLowerCase()} xuất phòng`,
        oldIndex: finalOldIndex,
        newIndex: finalNewIndex,
        usage,
        unitPrice: servicePrice,
        amount,
        isIndex: true
      });
      console.log(`[MOVEOUT] ${serviceName}: ${finalOldIndex} → ${finalNewIndex} (${usage} đơn vị x ${servicePrice} = ${amount})`);
    }

    // ---- 3. Dịch vụ mở rộng ----
    const bookService = await BookService.findOne({ contractId }).populate('services.serviceId');
    if (bookService?.services?.length > 0) {
      for (const srvItem of bookService.services) {
        if (!srvItem.serviceId) continue;
        const nameCheck = (srvItem.serviceId.name || '').toLowerCase().trim();
        if (['diện', 'dien', 'nước', 'nuoc'].includes(nameCheck)) continue;
        if (srvItem.endDate && new Date(srvItem.endDate) < now) continue;

        let srvPrice = srvItem.serviceId.currentPrice || srvItem.serviceId.price || 0;
        srvPrice = typeof srvPrice === 'object' && srvPrice.$numberDecimal
          ? parseFloat(srvPrice.$numberDecimal)
          : Number(srvPrice) || 0;

        const qty = srvItem.quantity || 1;
        const amount = Math.round(qty * srvPrice);
        totalAmount += amount;

        invoiceItems.push({
          itemName: `Dịch vụ ${srvItem.serviceId.name}`,
          usage: qty,
          unitPrice: srvPrice,
          amount,
          isIndex: false
        });
      }
    }

    // ---- Lưu vào invoice_periodics với status Unpaid (phát hành ngay) ----
    const invoiceCode = `FINAL-${contract.contractCode}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;

    const finalInvoice = new InvoicePeriodic({
      invoiceCode,
      contractId,
      title: `Hóa đơn xuất phòng - ${contract.contractCode}`,
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
  //  STEP 4a – Thanh toán online (tạo payment ticket)
  // ============================================================
  /**
   * Nếu deposit >= invoice: dùng cọc bù hóa đơn, hoàn phần dư (nếu có), terminate
   * Nếu deposit < invoice: tạo payment record cho phần còn thiếu
   */
  async createOnlinePaymentTicket(moveOutRequestId) {
    console.log(`[MOVEOUT] 💳 Tạo payment ticket online: ${moveOutRequestId}`);

    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");
    if (moveOutRequest.status !== "InvoiceReleased")
      throw new Error("Hóa đơn cuối chưa được phát hành");

    const comparison = await this.getDepositVsInvoice(moveOutRequestId);
    const transactionCode = `MO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    let payment;

    if (comparison.depositCoversInvoice) {
      // Deposit bù hóa đơn → tạo payment từ deposit
      payment = new Payment({
        invoiceId: moveOutRequest.finalInvoiceId,
        amount: comparison.invoiceAmount,
        transactionCode,
        status: "Success",
        paymentDate: new Date()
      });
      await payment.save();

      // Mark invoice Paid
      await InvoicePeriodic.findByIdAndUpdate(moveOutRequest.finalInvoiceId, { status: "Paid" });

      // Cập nhật số tiền hoàn cọc
      moveOutRequest.depositRefundAmount = comparison.isDepositForfeited ? 0 : comparison.refundToTenant;

      // Forfeited deposit nếu mất cọc
      if (comparison.depositId) {
        const depositStatus = comparison.isDepositForfeited ? "Forfeited" : "Refunded";
        await Deposit.findByIdAndUpdate(comparison.depositId, {
          status: depositStatus,
          refundDate: comparison.isDepositForfeited ? null : new Date(),
          forfeitedDate: comparison.isDepositForfeited ? new Date() : null
        });
      }

      // Hoàn tất luôn (cọc đủ bù hóa đơn → không cần tenant trả thêm)
      moveOutRequest.status = "Paid";
      moveOutRequest.paymentMethod = "online";
      moveOutRequest.paymentTransactionCode = transactionCode;
      moveOutRequest.paymentDate = new Date();
      await moveOutRequest.save();

      console.log(`[MOVEOUT] ✅ Deposit bù hóa đơn thành công`);
      return { payment, depositCoversInvoice: true, remainingToPay: 0, transactionCode };
    } else {
      // Tenant cần trả thêm phần chênh lệch
      payment = new Payment({
        invoiceId: moveOutRequest.finalInvoiceId,
        amount: comparison.remainingToPay,
        transactionCode,
        status: "Pending",
        paymentDate: null
      });
      await payment.save();

      moveOutRequest.paymentMethod = "online";
      moveOutRequest.paymentTransactionCode = transactionCode;
      await moveOutRequest.save();

      console.log(`[MOVEOUT] 💳 Payment ticket tạo, chờ tenant thanh toán`);
      return {
        payment,
        depositCoversInvoice: false,
        remainingToPay: comparison.remainingToPay,
        transactionCode,
        message: "Tenant cần thanh toán phần chênh lệch"
      };
    }
  }

  // ============================================================
  //  STEP 4a callback – Online payment success callback
  // ============================================================
  async handleOnlinePaymentSuccess(moveOutRequestId, transactionCode) {
    console.log(`[MOVEOUT] ✅ Online payment success: ${moveOutRequestId}`);

    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");

    // Mark invoice Paid
    await InvoicePeriodic.findByIdAndUpdate(moveOutRequest.finalInvoiceId, { status: "Paid" });

    // Update payment
    await Payment.findOneAndUpdate(
      { transactionCode: moveOutRequest.paymentTransactionCode },
      { status: "Success", paymentDate: new Date() }
    );

    // Lấy deposit info để xử lý cọc
    const contract = await Contract.findById(moveOutRequest.contractId);
    if (contract?.depositId) {
      const depositStatus = moveOutRequest.isDepositForfeited ? "Forfeited" : "Refunded";
      await Deposit.findByIdAndUpdate(contract.depositId, {
        status: depositStatus,
        refundDate: moveOutRequest.isDepositForfeited ? null : new Date(),
        forfeitedDate: moveOutRequest.isDepositForfeited ? new Date() : null
      });
    }

    moveOutRequest.status = "Paid";
    moveOutRequest.paymentDate = new Date();
    await moveOutRequest.save();

    return moveOutRequest;
  }

  // ============================================================
  //  STEP 4b – Thanh toán offline (Kế toán xác nhận)
  // ============================================================
  async confirmPaymentOffline(moveOutRequestId, accountantNotes = "") {
    console.log(`[MOVEOUT] 💵 Kế toán xác nhận thanh toán offline: ${moveOutRequestId}`);

    const moveOutRequest = await MoveOutRequest.findById(moveOutRequestId);
    if (!moveOutRequest) throw new Error("Không tìm thấy yêu cầu trả phòng");
    if (moveOutRequest.status !== "InvoiceReleased")
      throw new Error(`Chỉ có thể xác nhận thanh toán khi status là InvoiceReleased (hiện tại: ${moveOutRequest.status})`);

    const transactionCode = `OFFLINE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Tạo payment record
    const finalInvoice = await InvoicePeriodic.findById(moveOutRequest.finalInvoiceId);
    if (!finalInvoice) throw new Error("Không tìm thấy hóa đơn cuối");

    const payment = new Payment({
      invoiceId: moveOutRequest.finalInvoiceId,
      amount: finalInvoice.totalAmount,
      transactionCode,
      status: "Success",
      paymentDate: new Date()
    });
    await payment.save();

    // Mark invoice Paid
    await InvoicePeriodic.findByIdAndUpdate(moveOutRequest.finalInvoiceId, { status: "Paid" });

    // Xử lý deposit
    const contract = await Contract.findById(moveOutRequest.contractId);
    if (contract?.depositId) {
      const depositStatus = moveOutRequest.isDepositForfeited ? "Forfeited" : "Refunded";
      await Deposit.findByIdAndUpdate(contract.depositId, {
        status: depositStatus,
        refundDate: moveOutRequest.isDepositForfeited ? null : new Date(),
        forfeitedDate: moveOutRequest.isDepositForfeited ? new Date() : null
      });
    }

    moveOutRequest.status = "Paid";
    moveOutRequest.paymentMethod = "offline";
    moveOutRequest.paymentTransactionCode = transactionCode;
    moveOutRequest.paymentDate = new Date();
    moveOutRequest.accountantNotes = accountantNotes;
    await moveOutRequest.save();

    // Notify tenant
    await this._notifyTenant(
      moveOutRequest.tenantId,
      `✅ Thanh toán đã được xác nhận`,
      `Kế toán đã xác nhận thanh toán hóa đơn cuối của bạn.\nGhi chú: ${accountantNotes || 'Không có'}\n\nVui lòng chờ quản lý hoàn tất thủ tục trả phòng.`
    );

    console.log(`[MOVEOUT] ✅ Kế toán xác nhận thành công`);
    return { moveOutRequest, payment };
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
    } catch (err) {
      console.warn(`[MOVEOUT] ⚠️ Lỗi notify manager: ${err.message}`);
    }
  }

  async _notifyTenant(tenantId, title, content) {
    try {
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
    } catch (err) {
      console.warn(`[MOVEOUT] ⚠️ Lỗi notify tenant: ${err.message}`);
    }
  }
}

module.exports = new MoveOutRequestService();
