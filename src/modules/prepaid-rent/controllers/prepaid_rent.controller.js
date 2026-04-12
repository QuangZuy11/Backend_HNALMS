const PrepaidRentService = require("../services/prepaid_rent.service");
const PrepaidRentRequest = require("../models/prepaid_rent.model");
const Payment = require("../../invoice-management/models/payment.model");
const InvoiceIncurred = require("../../invoice-management/models/invoice_incurred.model");
const Contract = require("../../contract-management/models/contract.model");

const handleError = (res, error) => {
  console.error("🔴 PrepaidRent Error:", error);
  const status = error.status || 500;
  const message = error.message || "Lỗi server nội bộ";
  res.status(status).json({ success: false, message });
};

// ============================================================
// GET /prepaid-rent/contract
// Lấy thông tin hợp đồng đang active của tenant để hiển thị form
// ============================================================
exports.getMyContract = async (req, res) => {
  try {
    const tenantId = req.user?.userId || req.user?.id || req.user?._id;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const contracts = await PrepaidRentService.getActiveContractsByTenant(tenantId);
    if (!contracts.length) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hợp đồng đang hoạt động." });
    }

    const contractsPayload = contracts.map((contract) => {
      const priceRaw = contract.roomId?.roomTypeId?.currentPrice;
      const roomPrice = Number(priceRaw);
      return {
        contractId: contract._id,
        contractCode: contract.contractCode,
        startDate: contract.startDate,
        endDate: contract.endDate,
        rentPaidUntil: contract.rentPaidUntil,
        room: {
          name: contract.roomId?.name,
          roomTypeName: contract.roomId?.roomTypeId?.typeName,
          roomPrice: Number.isFinite(roomPrice) ? roomPrice : 0,
        },
        minPrepaidMonths: contract.minPrepaidMonths,
        maxPrepaidMonths: contract.maxPrepaidMonths,
        monthsRemaining: contract.monthsRemaining,
      };
    });

    res.status(200).json({
      success: true,
      data: { contracts: contractsPayload },
    });
  } catch (error) {
    handleError(res, error);
  }
};

// ============================================================
// POST /prepaid-rent/create
// Tạo yêu cầu trả trước + khởi tạo thanh toán QR
// ============================================================
exports.createPrepaidRentRequest = async (req, res) => {
  try {
    const tenantId = req.user?.userId || req.user?.id || req.user?._id;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { contractId, prepaidMonths } = req.body;
    if (!contractId) {
      return res.status(400).json({ success: false, message: "Thiếu mã hợp đồng." });
    }
    const monthsNum = parseInt(prepaidMonths, 10);
    if (!Number.isFinite(monthsNum) || monthsNum < 1) {
      return res.status(400).json({ success: false, message: "Số tháng đóng trước không hợp lệ." });
    }

    const result = await PrepaidRentService.createPrepaidRentRequest(
      tenantId,
      contractId,
      monthsNum
    );

    res.status(201).json({
      success: true,
      message: "Tạo yêu cầu trả trước thành công. Vui lòng quét QR để thanh toán.",
      data: result,
    });
  } catch (error) {
    handleError(res, error);
  }
};

// ============================================================
// GET /prepaid-rent/payment-status/:transactionCode
// Poll trạng thái thanh toán
// ============================================================
exports.getPaymentStatus = async (req, res) => {
  try {
    const { transactionCode } = req.params;
    if (!transactionCode) {
      return res.status(400).json({ success: false, message: "Thiếu mã giao dịch." });
    }

    const result = await PrepaidRentService.getPrepaidRentPaymentStatus(transactionCode);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleError(res, error);
  }
};

// ============================================================
// POST /prepaid-rent/cancel/:transactionCode
// Hủy yêu cầu trả trước
// ============================================================
exports.cancelPrepaidRentRequest = async (req, res) => {
  try {
    const { transactionCode } = req.params;
    if (!transactionCode) {
      return res.status(400).json({ success: false, message: "Thiếu mã giao dịch." });
    }

    const result = await PrepaidRentService.cancelPrepaidRentRequest(transactionCode);
    res.status(200).json({ success: true, message: "Đã hủy yêu cầu trả trước.", data: result });
  } catch (error) {
    handleError(res, error);
  }
};

// ============================================================
// GET /prepaid-rent/history
// Lấy lịch sử trả trước của tenant
// ============================================================
exports.getPrepaidRentHistory = async (req, res) => {
  try {
    const tenantId = req.user?.userId || req.user?.id || req.user?._id;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const history = await PrepaidRentService.getPrepaidRentHistory(tenantId);
    res.status(200).json({ success: true, data: history });
  } catch (error) {
    handleError(res, error);
  }
};

// ============================================================
// WEBHOOK: Xử lý thanh toán trả trước thành công (Sepay gọi)
// ============================================================
exports.sepayWebhookForPrepaidRent = async (req, res) => {
  try {
    const { transferAmount, content } = req.body;

    console.log("[PREPAID RENT WEBHOOK] 📥 Raw content:", content);
    console.log("[PREPAID RENT WEBHOOK] 💰 Transfer amount:", transferAmount);

    const matchCode = content.match(/PREPAID\s+\S+\s+\d{8}/i);
    if (!matchCode) {
      console.warn("[PREPAID RENT WEBHOOK] ⚠️ Không tìm thấy mã PREPAID trong nội dung:", content);
      return res.status(200).json({ success: true, message: "No matching prepaid transaction code" });
    }
    const transactionCode = matchCode[0];
    console.log("[PREPAID RENT WEBHOOK] 🔍 Extracted transactionCode:", transactionCode);

    const Payment = require("../../invoice-management/models/payment.model");
    const payment = await Payment.findOne({ transactionCode, status: "Pending" });
    console.log("[PREPAID RENT WEBHOOK] 🔍 Payment found:", payment);

    if (!payment) {
      console.warn("[PREPAID RENT WEBHOOK] ⚠️ Payment không tồn tại hoặc đã xử lý:", transactionCode);
      return res.status(200).json({ success: true, message: "Payment not found or already processed" });
    }

    const diff = Math.abs(transferAmount - payment.amount);
    if (diff > 1000) {
      console.warn(`[PREPAID RENT WEBHOOK] ⚠️ Số tiền không khớp: nhận ${transferAmount}, cần ${payment.amount}`);
      return res.status(200).json({ success: true, message: "Amount mismatch" });
    }

    const result = await PrepaidRentService.confirmPrepaidRentPayment(transactionCode);
    if (!result) {
      console.warn("[PREPAID RENT WEBHOOK] ⚠️ Request không tìm thấy hoặc đã xử lý");
      return res.status(200).json({ success: true, message: "Request not found or already processed" });
    }

    console.log("[PREPAID RENT WEBHOOK] ✅ Thanh toán trả trước xác nhận thành công:", result);
    return res.status(200).json({ success: true, message: "Prepaid rent payment confirmed successfully" });
  } catch (error) {
    console.error("[PREPAID RENT WEBHOOK] ❌ Error:", error);
    return res.status(200).json({ success: false, message: "Internal error" });
  }
};
