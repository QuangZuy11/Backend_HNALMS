const express = require("express");
const router = express.Router();
const Payment = require("../../modules/invoice-management/models/payment.model");
const InvoicePeriodic = require("../../modules/invoice-management/models/invoice_periodic.model");
const InvoiceIncurred = require("../../modules/invoice-management/models/invoice_incurred.model");
const RepairRequest = require("../../modules/request-management/models/repair_requests.model");

/**
 * Endpoint TEST để simulate thanh toán thành công
 * Không cần auth - chỉ dùng để test
 */
router.post("/test/invoice-payment", async (req, res) => {
  try {
    const { transactionCode, amount } = req.body;

    console.log("[TEST INVOICE PAYMENT] 📥 Received:", { transactionCode, amount });

    if (!transactionCode) {
      return res.status(400).json({ success: false, message: "Thiếu transactionCode" });
    }

    const payment = await Payment.findOne({ transactionCode, status: "Pending" });
    if (!payment) {
      console.log("[TEST INVOICE PAYMENT] ⚠️ Payment not found, checking all statuses...");
      // Thử tìm payment không phân biệt status
      const anyPayment = await Payment.findOne({ transactionCode });
      if (anyPayment) {
        return res.status(400).json({
          success: false,
          message: `Payment đã tồn tại với status: ${anyPayment.status}`,
          payment: anyPayment
        });
      }
      return res.status(404).json({ success: false, message: "Không tìm thấy payment" });
    }

    console.log("[TEST INVOICE PAYMENT] ✅ Payment found:", payment);

    // Kiểm tra số tiền nếu có
    if (amount) {
      const diff = Math.abs(amount - payment.amount);
      if (diff > 1000) {
        return res.status(400).json({ success: false, message: "Số tiền không khớp" });
      }
    }

    // Xác định loại hóa đơn và cập nhật
    let invoice;
    let invoiceType = '';

    if (payment.invoiceId) {
      invoice = await InvoicePeriodic.findById(payment.invoiceId);
      invoiceType = 'periodic';
      console.log("[TEST INVOICE PAYMENT] 📅 InvoicePeriodic found:", invoice?._id);
    } else if (payment.incurredInvoiceId) {
      invoice = await InvoiceIncurred.findById(payment.incurredInvoiceId);
      invoiceType = 'incurred';
      console.log("[TEST INVOICE PAYMENT] 📄 InvoiceIncurred found:", invoice?._id);
    }

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Không tìm thấy invoice" });
    }

    // Cập nhật payment
    payment.status = "Success";
    payment.paymentDate = new Date();
    await payment.save();

    // Cập nhật invoice
    invoice.status = "Paid";
    await invoice.save();

    // Cập nhật repair request nếu là incurred
    if (invoiceType === 'incurred' && invoice.repairRequestId) {
      await RepairRequest.findByIdAndUpdate(invoice.repairRequestId, { status: "Paid" });
    }

    console.log("[TEST INVOICE PAYMENT] ✅ Payment confirmed!");

    return res.status(200).json({
      success: true,
      message: "Thanh toán thành công!",
      data: {
        paymentId: payment._id,
        invoiceId: invoice._id,
        invoiceType,
        status: payment.status
      }
    });
  } catch (error) {
    console.error("[TEST INVOICE PAYMENT] ❌ Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
