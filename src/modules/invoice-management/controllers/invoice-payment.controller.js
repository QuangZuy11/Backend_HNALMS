const Invoice = require("../models/invoice.model");
const Payment = require("../models/payment.model");
const RepairRequest = require("../../request-management/models/repair_requests.model");

// =============================================
// HELPER: Sinh mã giao dịch cho hóa đơn phát sinh
// Format: HD [InvoiceCode rút gọn] [DDMMYYYY]
// VD: "HD INV320 05032026"
// =============================================
const generateInvoiceTransactionCode = (invoiceCode) => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`;

    // Sanitize invoiceCode: bỏ ký tự đặc biệt
    const shortCode = invoiceCode
        .replace(/Phòng\s*/gi, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 12); // Giới hạn độ dài

    return `HD ${shortCode} ${dateStr}`;
};

// =============================================
// POST /api/invoices/:id/payment/initiate
// Bước 1: Tenant gửi yêu cầu thanh toán → nhận QR chuyển khoản
// =============================================
exports.initiateInvoicePayment = async (req, res) => {
    try {
        const { id: invoiceId } = req.params;

        // --- Tìm hóa đơn ---
        const invoice = await Invoice.findById(invoiceId).populate("roomId", "name");
        if (!invoice) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hóa đơn." });
        }
        if (invoice.type !== "Incurred") {
            return res.status(400).json({ success: false, message: "Hóa đơn này không phải loại phát sinh (Incurred)." });
        }
        if (invoice.status !== "Unpaid") {
            return res.status(400).json({
                success: false,
                message: `Hóa đơn không thể thanh toán (trạng thái hiện tại: ${invoice.status}).`,
            });
        }

        // --- Kiểm tra đã có Payment Pending chưa (tránh tạo trùng) ---
        const existingPending = await Payment.findOne({
            invoiceId: invoice._id,
            status: "Pending",
        });
        if (existingPending) {
            // Kiểm tra hết hạn 5 phút
            const createdAt = new Date(existingPending.createdAt);
            const expireAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
            if (new Date() < expireAt) {
                // Còn hạn → trả lại QR cũ
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
                        roomName: invoice.roomId?.name || null,
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
            } else {
                // Đã hết hạn → xóa pending cũ
                await Payment.findByIdAndDelete(existingPending._id);
            }
        }

        // --- Sinh mã giao dịch ---
        const transactionCode = generateInvoiceTransactionCode(invoice.invoiceCode);

        // --- Tính thời gian hết hạn (5 phút) ---
        const expireAt = new Date(Date.now() + 5 * 60 * 1000);

        // --- Tạo Payment Pending ---
        const payment = new Payment({
            invoiceId: invoice._id,
            amount: invoice.totalAmount,
            transactionCode,
            status: "Pending",
            paymentDate: null,
        });
        await payment.save();

        // --- Tạo QR Code URL theo chuẩn VietQR ---
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
                roomName: invoice.roomId?.name || null,
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

// =============================================
// GET /api/invoices/payment/status/:transactionCode
// FE polling kiểm tra trạng thái thanh toán
// =============================================
exports.getInvoicePaymentStatus = async (req, res) => {
    try {
        const { transactionCode } = req.params;

        const payment = await Payment.findOne({ transactionCode })
            .populate("invoiceId", "invoiceCode status type totalAmount");

        if (!payment) {
            return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch hoặc giao dịch đã hết hạn." });
        }

        // --- Kiểm tra hết hạn 5 phút nếu còn Pending ---
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
                    invoice: payment.invoiceId,
                    expireInSeconds,
                },
            });
        }

        // Trả về trạng thái hiện tại (Success / Failed)
        return res.status(200).json({
            success: true,
            data: {
                status: payment.status,
                paymentId: payment._id,
                transactionCode,
                amount: payment.amount,
                paymentDate: payment.paymentDate,
                invoice: payment.invoiceId,
            },
        });
    } catch (error) {
        console.error("Get Invoice Payment Status Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// =============================================
// POST /api/invoices/webhook/sepay
// Sepay gọi endpoint này khi phát hiện biến động số dư (cho hóa đơn phát sinh)
// =============================================
exports.sepayWebhookForInvoice = async (req, res) => {
    try {
        // Auth đã được xử lý bởi middleware verifySepayToken (src/shared/routes/sepay-webhook.routes.js)

        // --- Parse dữ liệu từ Sepay ---
        const { transferAmount, content, transferType } = req.body;

        // --- 3. Tìm mã giao dịch hóa đơn trong nội dung CK ---
        // Format: "HD [code] DDMMYYYY"
        const matchCode = content.match(/HD\s+\S+\s+\d{8}/i);
        if (!matchCode) {
            console.warn("[INVOICE WEBHOOK] ⚠️ Không tìm thấy mã HD trong nội dung:", content);
            return res.status(200).json({ success: true, message: "No matching invoice transaction code" });
        }
        const transactionCode = matchCode[0];

        // --- 4. Tìm Payment Pending khớp với transactionCode ---
        const payment = await Payment.findOne({ transactionCode, status: "Pending" });
        if (!payment) {
            console.warn("[INVOICE WEBHOOK] ⚠️ Payment không tồn tại hoặc đã xử lý:", transactionCode);
            return res.status(200).json({ success: true, message: "Payment not found or already processed" });
        }

        // --- 5. Kiểm tra số tiền (cho phép sai lệch ±1000đ) ---
        const diff = Math.abs(transferAmount - payment.amount);
        if (diff > 1000) {
            console.warn(`[INVOICE WEBHOOK] ⚠️ Số tiền không khớp: nhận ${transferAmount}, cần ${payment.amount}`);
            return res.status(200).json({ success: true, message: "Amount mismatch" });
        }

        // --- 6. Tìm Invoice liên quan ---
        const invoice = await Invoice.findById(payment.invoiceId);
        if (!invoice) {
            console.warn("[INVOICE WEBHOOK] ⚠️ Invoice không tìm thấy:", payment.invoiceId);
            return res.status(200).json({ success: true, message: "Invoice not found" });
        }

        // --- 7. Cập nhật Payment → Success ---
        payment.status = "Success";
        payment.paymentDate = new Date();
        await payment.save();
        console.log(`[INVOICE WEBHOOK] ✅ Payment updated → Success: ${payment._id}`);

        // --- 8. Cập nhật Invoice → Paid ---
        invoice.status = "Paid";
        await invoice.save();
        console.log(`[INVOICE WEBHOOK] ✅ Invoice ${invoice.invoiceCode} → Paid`);

        // --- 9. Cập nhật RepairRequest → Paid (nếu có) ---
        if (invoice.repairRequestId) {
            await RepairRequest.findByIdAndUpdate(invoice.repairRequestId, { status: "Paid" });
            console.log(`[INVOICE WEBHOOK] ✅ RepairRequest ${invoice.repairRequestId} → Paid`);
        }

        return res.status(200).json({ success: true, message: "Invoice payment confirmed successfully" });

    } catch (error) {
        console.error("[INVOICE WEBHOOK] ❌ Error:", error);
        // PHẢI trả 200 để Sepay không retry liên tục
        return res.status(200).json({ success: false, message: "Internal error" });
    }
};

// =============================================
// POST /api/invoices/:id/payment/cancel
// Frontend gọi khi user đóng modal QR (hủy giao dịch)
// =============================================
exports.cancelInvoicePayment = async (req, res) => {
    try {
        const { transactionCode } = req.params;

        const payment = await Payment.findOne({ transactionCode, status: "Pending" });
        if (!payment) {
            return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch hoặc giao dịch đã hoàn tất." });
        }

        await Payment.findByIdAndDelete(payment._id);
        console.log(`[CANCEL INVOICE PAYMENT] Payment deleted: ${transactionCode}`);

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
