const PrepaidRentRequest = require("../models/prepaid_rent.model");
const InvoiceIncurred = require("../../invoice-management/models/invoice_incurred.model");
const Payment = require("../../invoice-management/models/payment.model");
const Contract = require("../../contract-management/models/contract.model");
const Room = require("../../room-floor-management/models/room.model");

// ============================================================
// Helper: Sinh mã giao dịch cho yêu cầu trả trước
// Format: PREPAID [ContractCode rút gọn] [DDMMYYYY]
// ============================================================
const generatePrepaidTransactionCode = (contractCode) => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const dateStr = `${day}${month}${year}`;

  const shortCode = (contractCode || "UNKNOWN")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10)
    .toUpperCase();

  return `PREPAID ${shortCode} ${dateStr}`;
};

// Thời hạn hợp đồng (start → end), tính theo tháng lịch
const computeContractDurationMonths = (startDate, endDate) => {
  const s = new Date(startDate);
  const e = new Date(endDate);
  let months =
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  return Math.max(1, months);
};

// Hợp đồng ≤ 6 tháng: đóng trước tối thiểu 1 tháng; > 6 tháng: tối thiểu 2 tháng
const getMinPrepaidMonthsByDuration = (durationMonths) =>
  durationMonths <= 6 ? 1 : 2;

/**
 * Số tháng có thể cộng thêm (setMonth) từ mốc paidThrough mà không vượt endDate.
 * Khớp với confirmPrepaidRentPayment: newDate = paidThrough + N tháng, N <= kết quả hàm này.
 * @param {Date|string} paidThrough — rentPaidUntil hoặc startDate
 * @param {Date|string} endDate — ngày kết thúc HĐ
 * @returns {number}
 */
const maxPrepaidMonthsFromPaidThrough = (paidThrough, endDate) => {
  const base = new Date(paidThrough);
  const end = new Date(endDate);
  let m = 0;
  const cap = 240;
  for (let tryM = 1; tryM <= cap; tryM++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + tryM);
    if (d > end) break;
    m = tryM;
  }
  return m;
};

// ============================================================
// Bổ sung min/max prepaid + monthsRemaining cho một contract (lean)
// ============================================================
const enrichContractWithPrepaidFields = (contract) => {
  if (!contract) return null;

  const durationMonths = computeContractDurationMonths(
    contract.startDate,
    contract.endDate
  );
  const minPrepaidMonths = getMinPrepaidMonthsByDuration(durationMonths);

  const paidThrough = contract.rentPaidUntil
    ? new Date(contract.rentPaidUntil)
    : new Date(contract.startDate);
  const monthsRemaining = maxPrepaidMonthsFromPaidThrough(paidThrough, contract.endDate);

  const maxPrepaidMonths = Math.min(monthsRemaining, 12);

  return {
    ...contract,
    contractDurationMonths: durationMonths,
    minPrepaidMonths,
    maxPrepaidMonths,
    monthsRemaining,
  };
};

const activeContractPopulate = {
  path: "roomId",
  select: "name roomCode floorId roomTypeId",
  populate: [
    { path: "floorId", select: "name" },
    { path: "roomTypeId", select: "typeName currentPrice" },
  ],
};

// ============================================================
// Tất cả hợp đồng active của tenant (đã populate + prepaid fields)
// ============================================================
exports.getActiveContractsByTenant = async (tenantId) => {
  const list = await Contract.find({
    tenantId,
    status: "active",
  })
    .populate(activeContractPopulate)
    .lean();

  return list.map(enrichContractWithPrepaidFields).filter(Boolean);
};

// ============================================================
// Một hợp đồng active (tương thích cũ — lấy bản đầu tiên)
// ============================================================
exports.getActiveContractByTenant = async (tenantId) => {
  const contracts = await exports.getActiveContractsByTenant(tenantId);
  return contracts[0] || null;
};

// ============================================================
// Tạo yêu cầu trả trước + khởi tạo thanh toán QR
// ============================================================
exports.createPrepaidRentRequest = async (tenantId, contractId, prepaidMonths) => {
  // 1. Validate contract
  const contract = await Contract.findOne({ _id: contractId, tenantId, status: "active" })
    .populate({
      path: "roomId",
      select: "name roomCode floorId roomTypeId",
      populate: [
        { path: "floorId", select: "name" },
        { path: "roomTypeId", select: "typeName currentPrice" },
      ],
    })
    .lean();

  if (!contract) {
    throw { status: 404, message: "Không tìm thấy hợp đồng đang hoạt động." };
  }

  const durationMonths = computeContractDurationMonths(
    contract.startDate,
    contract.endDate
  );
  const minPrepaidMonths = getMinPrepaidMonthsByDuration(durationMonths);

  const paidThrough = contract.rentPaidUntil
    ? new Date(contract.rentPaidUntil)
    : new Date(contract.startDate);
  const monthsRemaining = maxPrepaidMonthsFromPaidThrough(paidThrough, contract.endDate);

  // 2. Validate prepaidMonths
  const m = Number(prepaidMonths);
  if (!Number.isInteger(m) || m < 1) {
    throw { status: 400, message: "Số tháng đóng trước không hợp lệ." };
  }
  if (m < minPrepaidMonths) {
    throw {
      status: 400,
      message:
        minPrepaidMonths === 1
          ? "Số tháng đóng trước tối thiểu là 1 tháng (hợp đồng ngắn hạn)."
          : "Số tháng đóng trước tối thiểu là 2 tháng (hợp đồng trên 6 tháng).",
    };
  }

  if (m > monthsRemaining) {
    throw {
      status: 400,
      message: `Chỉ còn ${monthsRemaining} tháng đến khi hợp đồng kết thúc. Không thể đóng trước nhiều hơn.`,
    };
  }

  // 3. Tính số tiền
  const roomPrice = contract.roomId?.roomTypeId?.currentPrice || 0;
  const totalAmount = m * roomPrice;

  if (totalAmount <= 0) {
    throw { status: 400, message: "Giá phòng không hợp lệ." };
  }

  // 4. Xóa request cũ đang pending (nếu có) để tránh conflict
  await PrepaidRentRequest.deleteMany({ contractId, status: "pending" });

  // 5. Tạo request record
  const request = new PrepaidRentRequest({
    tenantId,
    contractId,
    prepaidMonths: m,
    totalAmount,
    status: "pending",
  });
  await request.save();

  // 6. Tạo payment record (sepay)
  const transactionCode = generatePrepaidTransactionCode(contract.contractCode);
  const expireAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút

  const payment = new Payment({
    amount: totalAmount,
    transactionCode,
    status: "Pending",
    paymentDate: null,
  });
  await payment.save();

  // 7. Cập nhật request với paymentId
  request.paymentId = payment._id;
  request.transactionCode = transactionCode;
  await request.save();

  // 8. Build VietQR URL
  const bankBin = process.env.BANK_BIN;
  const bankAccount = process.env.BANK_ACCOUNT;
  const bankAccountName = process.env.BANK_ACCOUNT_NAME || "HOANG NAM ALMS";
  const encodedContent = encodeURIComponent(transactionCode);
  const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-qr_only.jpg?amount=${totalAmount}&addInfo=${encodedContent}&accountName=${encodeURIComponent(bankAccountName)}`;

  return {
    requestId: request._id,
    contractCode: contract.contractCode,
    roomName: contract.roomId?.name,
    roomTypeName: contract.roomId?.roomTypeId?.typeName,
    roomPrice,
    prepaidMonths: m,
    totalAmount,
    transactionCode,
    qrUrl,
    bankInfo: {
      bankBin,
      bankAccount,
      bankAccountName,
      content: transactionCode,
    },
    expireAt,
    expireInSeconds: Math.floor((expireAt - Date.now()) / 1000),
  };
};

// ============================================================
// Lấy trạng thái thanh toán của request trả trước
// ============================================================
exports.getPrepaidRentPaymentStatus = async (transactionCode) => {
  const request = await PrepaidRentRequest.findOne({ transactionCode })
    .populate("contractId", "contractCode roomId")
    .populate("paymentId")
    .lean();

  if (!request) {
    throw { status: 404, message: "Không tìm thấy yêu cầu trả trước." };
  }

  const payment = await Payment.findById(request.paymentId);
  if (!payment) {
    throw { status: 404, message: "Không tìm thấy giao dịch thanh toán." };
  }

  // Kiểm tra hết hạn
  if (payment.status === "Pending") {
    const expireAt = new Date(new Date(payment.createdAt).getTime() + 5 * 60 * 1000);
    if (new Date() > expireAt) {
      // Tự động hủy request & payment hết hạn
      payment.status = "Failed";
      await payment.save();
      request.status = "expired";
      await PrepaidRentRequest.findByIdAndUpdate(request._id, { status: "expired" });

      return {
        status: "expired",
        transactionCode,
        requestId: request._id,
        message: "Giao dịch đã hết hạn thanh toán.",
      };
    }

    return {
      status: "pending",
      requestId: request._id,
      requestStatus: request.status,
      transactionCode,
      amount: payment.amount,
      expireInSeconds: Math.max(0, Math.floor((expireAt - Date.now()) / 1000)),
    };
  }

  return {
    status: payment.status,
    requestId: request._id,
    requestStatus: request.status,
    transactionCode,
    amount: payment.amount,
    paymentDate: payment.paymentDate,
  };
};

// ============================================================
// Xác nhận thanh toán thành công (được gọi từ webhook hoặc polling)
// Tạo hóa đơn HD-PREPAID với status = "Paid"
// ============================================================
exports.confirmPrepaidRentPayment = async (transactionCode) => {
  const request = await PrepaidRentRequest.findOne({ transactionCode, status: "pending" })
    .populate({
      path: "contractId",
      populate: { path: "roomId" },
    })
    .lean();

  if (!request) return null; // Không tìm thấy hoặc đã xử lý

  // Cập nhật payment
  const payment = await Payment.findByIdAndUpdate(
    request.paymentId,
    { status: "Success", paymentDate: new Date() },
    { new: true }
  );

  // Tạo hóa đơn trả trước tiền phòng (InvoiceIncurred type = prepaid, status = Paid)
  const contract = await Contract.findById(request.contractId).lean();
  const now = new Date();
  const datePrefix = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${now.getFullYear()}`;
  const nextSeq = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const invoiceCode = `HD-PREPAID-${datePrefix}-${nextSeq}`;

  const invoiceIncurred = new InvoiceIncurred({
    invoiceCode,
    contractId: request.contractId,
    repairRequestId: null,
    title: `Thanh toán tiền phòng trả trước (${request.prepaidMonths} tháng)`,
    totalAmount: request.totalAmount,
    status: "Paid",
    type: "prepaid",
    dueDate: now,
    images: [],
  });
  await invoiceIncurred.save();

  // Cập nhật rentPaidUntil trong contract (không vượt quá endDate — trùng kỳ với HĐ)
  const currentRentPaidUntil = contract.rentPaidUntil ? new Date(contract.rentPaidUntil) : new Date(contract.startDate);
  const newRentPaidUntil = new Date(currentRentPaidUntil);
  newRentPaidUntil.setMonth(newRentPaidUntil.getMonth() + request.prepaidMonths);
  const contractEnd = new Date(contract.endDate);
  if (newRentPaidUntil > contractEnd) {
    newRentPaidUntil.setTime(contractEnd.getTime());
  }

  await Contract.findByIdAndUpdate(request.contractId, {
    rentPaidUntil: newRentPaidUntil,
  });

  // Cập nhật request
  request.status = "paid";
  request.invoiceIncurredId = invoiceIncurred._id;
  await PrepaidRentRequest.findByIdAndUpdate(request._id, {
    status: "paid",
    invoiceIncurredId: invoiceIncurred._id,
  });

  return {
    success: true,
    requestId: request._id,
    invoiceIncurredId: invoiceIncurred._id,
    invoiceCode: invoiceIncurred.invoiceCode,
    totalAmount: request.totalAmount,
    prepaidMonths: request.prepaidMonths,
    newRentPaidUntil,
    paymentDate: payment.paymentDate,
  };
};

// ============================================================
// Hủy yêu cầu trả trước (khi user hủy hoặc hết hạn)
// ============================================================
exports.cancelPrepaidRentRequest = async (transactionCode) => {
  const request = await PrepaidRentRequest.findOne({ transactionCode, status: "pending" });
  if (!request) {
    throw { status: 404, message: "Không tìm thấy yêu cầu đang chờ thanh toán." };
  }

  // Xóa payment nếu có
  if (request.paymentId) {
    await Payment.findByIdAndDelete(request.paymentId);
  }

  // Cập nhật request
  request.status = "cancelled";
  await request.save();

  return { success: true, transactionCode, status: "cancelled" };
};

// ============================================================
// Lấy lịch sử trả trước của tenant
// ============================================================
exports.getPrepaidRentHistory = async (tenantId) => {
  const requests = await PrepaidRentRequest.find({ tenantId })
    .populate({
      path: "contractId",
      select: "contractCode roomId",
      populate: { path: "roomId", select: "name" },
    })
    .populate("invoiceIncurredId", "invoiceCode title totalAmount status")
    .sort({ createdAt: -1 })
    .lean();

  return requests.map((r) => ({
    _id: r._id,
    contractCode: r.contractId?.contractCode,
    roomName: r.contractId?.roomId?.name,
    prepaidMonths: r.prepaidMonths,
    totalAmount: r.totalAmount,
    status: r.status,
    transactionCode: r.transactionCode,
    invoiceCode: r.invoiceIncurredId?.invoiceCode,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
};
