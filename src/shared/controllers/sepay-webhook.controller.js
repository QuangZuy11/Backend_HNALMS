const depositController = require("../../modules/room-floor-management/controllers/deposit-room.controller");
const invoicePaymentController = require("../../modules/invoice-management/controllers/invoice-payment.controller");
const prepaidRentController = require("../../modules/prepaid-rent/controllers/prepaid_rent.controller");

/**
 * Webhook chung cho tất cả giao dịch Sepay
 * Phân biệt loại giao dịch qua nội dung chuyển khoản:
 *   - "Coc ..." → Đặt cọc phòng
 *   - "HD ..."  → Thanh toán hóa đơn phát sinh
 *   - "PREPAID ..." → Trả trước tiền phòng
 *
 * Middleware verifySepayToken đã xác thực API Key trước khi vào đây.
 */
exports.handleWebhook = async (req, res) => {
    try {
        const { content, transferType } = req.body;

        console.log("[SEPAY WEBHOOK] 📥 Received:", JSON.stringify(req.body, null, 2));

        // Chỉ xử lý tiền vào
        if (transferType !== "in") {
            return res.status(200).json({ success: true, message: "Ignored: not incoming transfer" });
        }

        if (!content) {
            return res.status(200).json({ success: true, message: "Ignored: no content" });
        }

        const upperContent = content.toUpperCase();

        // --- Phân biệt loại giao dịch ---

        // 1. Đặt cọc: nội dung chứa "COC"
        if (/COC\s+\S+\s+\d{8}/.test(upperContent)) {
            console.log("[SEPAY WEBHOOK] 🏠 Detected DEPOSIT transaction");
            return depositController.sepayWebhook(req, res);
        }

        // 2. Hóa đơn phát sinh: nội dung chứa "HD"
        if (/HD\s+\S+\s+\d{8}/.test(upperContent)) {
            console.log("[SEPAY WEBHOOK] 📄 Detected INVOICE transaction");
            return invoicePaymentController.sepayWebhookForInvoice(req, res);
        }

        // 3. Trả trước tiền phòng: nội dung chứa "PREPAID"
        if (/PREPAID\s+\S+\s+\d{8}/.test(upperContent)) {
            console.log("[SEPAY WEBHOOK] 💰 Detected PREPAID RENT transaction");
            return prepaidRentController.sepayWebhookForPrepaidRent(req, res);
        }

        // 4. Không khớp loại nào
        console.log(`[SEPAY WEBHOOK] ❓ Unknown transaction type: "${content}"`);
        return res.status(200).json({
            success: true,
            message: "Ignored: transaction type not recognized",
        });
    } catch (error) {
        console.error("[SEPAY WEBHOOK] ❌ Error:", error.message);
        return res.status(200).json({ success: false, message: "Internal error" });
    }
};
