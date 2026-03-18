const InvoicePeriodic = require("../models/invoice_periodic.model");
const InvoiceIncurred = require("../models/invoice_incurred.model");
const Payment = require("../models/payment.model");
const RepairRequest = require("../../request-management/models/repair_requests.model");

// =============================================
// HELPER: Sinh mã giao dịch cho hóa đơn phát sinh
// Format: HD [InvoiceCode rút gọn] [DDMMYYYY]
// VD: "HD INV320 05032026"
// =============================================
const generateInvoiceTransactionCode = (invoiceCode) => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const dateStr = `${day}${month}${year}`;

  const shortCode = invoiceCode
    .replace(/Phòng\s*/gi, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);

  return `HD ${shortCode} ${dateStr}`;
};

exports.initiateInvoicePayment = async (req, res) => {
  try {
    const { id: invoiceId } = req.params;
    const { type } = req.body; // 'periodic' hoặc 'incurred'

    let invoice;
    let invoiceType = type || 'incurred';

    // Tìm hóa đơn theo loại
    if (invoiceType === 'periodic') {
      invoice = await InvoicePeriodic.findById(invoiceId).populate({
        path: "contractId",
        select: "roomId",
        populate: { path: "roomId", select: "name" },
      });
    } else {
      invoice = await InvoiceIncurred.findById(invoiceId).populate({
        path: "contractId",
        select: "roomId",
        populate: { path: "roomId", select: "name" },
      });
    }

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hóa đơn." });
    }
    if (invoice.status !== "Unpaid") {
      return res.status(400).json({
        success: false,
        message: `Hóa đơn không thể thanh toán (trạng thái hiện tại: ${invoice.status}).`,
      });
    }

    // Tìm payment đang chờ theo loại hóa đơn
    const paymentQuery = invoiceType === 'periodic'
      ? { invoiceId: invoice._id, status: "Pending" }
      : { incurredInvoiceId: invoice._id, status: "Pending" };

    const existingPending = await Payment.findOne(paymentQuery);
    if (existingPending) {
      const createdAt = new Date(existingPending.createdAt);
      const expireAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
      if (new Date() < expireAt) {
        const bankBin = process.env.BANK_BIN;
        const bankAccount = process.env.BANK_ACCOUNT;
        const bankAccountName = encodeURIComponent(process.env.BANK_ACCOUNT_NAME || "HOANG NAM ALMS");
        const encodedContent = encodeURIComponent(existingPending.transactionCode);
        const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-qr_only.jpg?amount=${existingPending.amount}&addInfo=${encodedContent}&accountName=${bankAccountName}`;

        return res.status(200).json({
          success: true,
          message: "Đã có giao dịch đang chờ thanh toán.",
          data: {
            paymentId: existingPending._id,
            transactionCode: existingPending.transactionCode,
            invoiceAmount: existingPending.amount,
            invoiceCode: invoice.invoiceCode,
            invoiceType: invoiceType,
            roomName: invoice.contractId?.roomId?.name || null,
            qrUrl,
            bankInfo: {
              bankBin,
              bankAccount,
              bankAccountName: process.env.BANK_ACCOUNT_NAME || "HOANG NAM ALMS",
              content: existingPending.transactionCode,
            },
            expireAt,
            expireInSeconds: Math.max(0, Math.floor((expireAt - Date.now()) / 1000)),
          },
        });
      }
      await Payment.findByIdAndDelete(existingPending._id);
    }

    const transactionCode = generateInvoiceTransactionCode(invoice.invoiceCode);
    const expireAt = new Date(Date.now() + 5 * 60 * 1000);

    // Tạo payment với trường phù hợp theo loại hóa đơn
    const paymentData = {
      amount: invoice.totalAmount,
      transactionCode,
      status: "Pending",
      paymentDate: null,
    };

    if (invoiceType === 'periodic') {
      paymentData.invoiceId = invoice._id;
    } else {
      paymentData.incurredInvoiceId = invoice._id;
    }

    const payment = new Payment(paymentData);
    await payment.save();

    const bankBin = process.env.BANK_BIN;
    const bankAccount = process.env.BANK_ACCOUNT;
    const bankAccountName = encodeURIComponent(process.env.BANK_ACCOUNT_NAME || "HOANG NAM ALMS");
    const encodedContent = encodeURIComponent(transactionCode);
    const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-qr_only.jpg?amount=${invoice.totalAmount}&addInfo=${encodedContent}&accountName=${bankAccountName}`;

    return res.status(201).json({
      success: true,
      message: "Khởi tạo thanh toán thành công. Vui lòng quét QR để thanh toán.",
      data: {
        paymentId: payment._id,
        transactionCode,
        invoiceAmount: invoice.totalAmount,
        invoiceCode: invoice.invoiceCode,
        invoiceType: invoiceType,
        roomName: invoice.contractId?.roomId?.name || null,
        qrUrl,
        bankInfo: {
          bankBin,
          bankAccount,
          bankAccountName: process.env.BANK_ACCOUNT_NAME || "HOANG NAM ALMS",
          content: transactionCode,
        },
        expireAt,
        expireInSeconds: Math.max(0, Math.floor((expireAt - Date.now()) / 1000)),
        expireNote: "Giao dịch cần được xác nhận trong 5 phút",
      },
    });
  } catch (error) {
    console.error("Initiate Invoice Payment Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal Server Error" });
  }
};

exports.getInvoicePaymentStatus = async (req, res) => {
  try {
    const { transactionCode } = req.params;

    const payment = await Payment.findOne({ transactionCode })
      .populate("invoiceId", "invoiceCode status totalAmount")
      .populate("incurredInvoiceId", "invoiceCode status totalAmount");

    if (!payment) {
      return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch hoặc giao dịch đã hết hạn." });
    }

    // Xác định loại hóa đơn
    const invoice = payment.invoiceId || payment.incurredInvoiceId;
    const invoiceType = payment.invoiceId ? 'periodic' : 'incurred';

    if (payment.status === "Pending") {
      const expireAt = new Date(new Date(payment.createdAt).getTime() + 5 * 60 * 1000);
      if (new Date() > expireAt) {
        await Payment.findByIdAndDelete(payment._id);
        return res.status(200).json({
          success: true,
          data: {
            status: "Expired",
            message: "Giao dịch đã hết hạn thanh toán.",
            transactionCode,
          },
        });
      }

      const expireInSeconds = Math.max(0, Math.floor((expireAt - Date.now()) / 1000));
      return res.status(200).json({
        success: true,
        data: {
          status: "Pending",
          paymentId: payment._id,
          transactionCode,
          amount: payment.amount,
          invoice,
          invoiceType,
          expireInSeconds,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        status: payment.status,
        paymentId: payment._id,
        transactionCode,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        invoice,
        invoiceType,
      },
    });
  } catch (error) {
    console.error("Get Invoice Payment Status Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.sepayWebhookForInvoice = async (req, res) => {
  try {
    const { transferAmount, content } = req.body;

    console.log("[INVOICE WEBHOOK] 📥 Raw content:", content);
    console.log("[INVOICE WEBHOOK] 💰 Transfer amount:", transferAmount);

    const matchCode = content.match(/HD\s+\S+\s+\d{8}/i);
    if (!matchCode) {
      console.warn("[INVOICE WEBHOOK] ⚠️ Không tìm thấy mã HD trong nội dung:", content);
      return res.status(200).json({ success: true, message: "No matching invoice transaction code" });
    }
    const transactionCode = matchCode[0];
    console.log("[INVOICE WEBHOOK] 🔍 Extracted transactionCode:", transactionCode);

    const payment = await Payment.findOne({ transactionCode, status: "Pending" });
    console.log("[INVOICE WEBHOOK] 🔍 Payment query:", { transactionCode, status: "Pending" });
    console.log("[INVOICE WEBHOOK] 🔍 Payment found:", payment);

    if (!payment) {
      console.warn("[INVOICE WEBHOOK] ⚠️ Payment không tồn tại hoặc đã xử lý:", transactionCode);
      return res.status(200).json({ success: true, message: "Payment not found or already processed" });
    }

    const diff = Math.abs(transferAmount - payment.amount);
    if (diff > 1000) {
      console.warn(`[INVOICE WEBHOOK] ⚠️ Số tiền không khớp: nhận ${transferAmount}, cần ${payment.amount}`);
      return res.status(200).json({ success: true, message: "Amount mismatch" });
    }

    // Xác định loại hóa đơn và cập nhật
    let invoice;
    let invoiceType = '';

    if (payment.invoiceId) {
      // Hóa đơn định kỳ (InvoicePeriodic)
      invoice = await InvoicePeriodic.findById(payment.invoiceId);
      invoiceType = 'periodic';
    } else if (payment.incurredInvoiceId) {
      // Hóa đơn phát sinh (InvoiceIncurred)
      invoice = await InvoiceIncurred.findById(payment.incurredInvoiceId);
      invoiceType = 'incurred';
    }

    if (!invoice) {
      console.warn("[INVOICE WEBHOOK] ⚠️ Invoice không tìm thấy");
      return res.status(200).json({ success: true, message: "Invoice not found" });
    }

    payment.status = "Success";
    payment.paymentDate = new Date();
    await payment.save();

    invoice.status = "Paid";
    await invoice.save();

    // Chỉ cập nhật repair request cho hóa đơn phát sinh
    if (invoiceType === 'incurred' && invoice.repairRequestId) {
      await RepairRequest.findByIdAndUpdate(invoice.repairRequestId, { status: "Paid" });
    }

    return res.status(200).json({ success: true, message: "Invoice payment confirmed successfully" });
  } catch (error) {
    console.error("[INVOICE WEBHOOK] ❌ Error:", error);
    return res.status(200).json({ success: false, message: "Internal error" });
  }
};

exports.cancelInvoicePayment = async (req, res) => {
  try {
    const { transactionCode } = req.params;

    const payment = await Payment.findOne({ transactionCode, status: "Pending" });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch hoặc giao dịch đã hoàn tất." });
    }

    await Payment.findByIdAndDelete(payment._id);

    return res.status(200).json({
      success: true,
      message: "Đã hủy giao dịch thanh toán hóa đơn.",
      data: { transactionCode, status: "Cancelled" },
    });
  } catch (error) {
    console.error("Cancel Invoice Payment Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
