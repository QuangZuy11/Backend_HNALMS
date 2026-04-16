const depositController = require("../../modules/room-floor-management/controllers/deposit-room.controller");
const invoicePaymentController = require("../../modules/invoice-management/controllers/invoice-payment.controller");
const prepaidRentController = require("../../modules/prepaid-rent/controllers/prepaid_rent.controller");
const bookingRequestController = require("../../modules/contract-management/controllers/booking-request.controller");

/**
 * Webhook chung cho tất cả giao dịch Sepay
 * Phân biệt loại giao dịch qua nội dung chuyển khoản:
 *   - "Coc <Room> <8digits>" → Booking Request online HOẶC Đặt cọc thường
 *     (phân biệt bằng DB lookup: tìm BookingRequest trước, nếu không thấy → Deposit)
 *   - "HD ..."    → Thanh toán hóa đơn phát sinh
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

        // 1. COC: Booking Request hoặc Deposit thường
        //    Format: "Coc <RoomCode> <8digits>" — ví dụ: Coc P112A 89358552
        //    Phân biệt bằng DB lookup: BookingRequest ưu tiên trước
        if (/COC\s+\S+\s+\d{8}/.test(upperContent)) {
            const matchCode = content.match(/Coc\s+\S+\s+\d{8}/i);
            if (matchCode) {
                const transCode = matchCode[0];
                console.log(`[SEPAY WEBHOOK] Parsed transactionCode: "${transCode}" from content: "${content}"`);
                
                const BookingRequest = require("../../modules/contract-management/models/booking-request.model");
                const br = await BookingRequest.findOne({ transactionCode: new RegExp(`^${transCode}$`, "i") });
                console.log(`[SEPAY WEBHOOK] BookingRequest lookup for "${transCode}":`, br ? {
                  _id: br._id,
                  status: br.status,
                  transactionCode: br.transactionCode
                } : "NOT FOUND");
                
                if (br) {
                    console.log("[SEPAY WEBHOOK] 📝 Detected BOOKING REQUEST transaction");
                    return bookingRequestController.handleSepayWebhook(req, res);
                }
            }
            // Không tìm thấy BookingRequest → xử lý như Deposit thường
            console.log("[SEPAY WEBHOOK] 🏠 Detected DEPOSIT transaction");
            return depositController.sepayWebhook(req, res);
        }

        // 2. Hóa đơn phát sinh: nội dung chứa "HD"
        if (/HD\s+\S+\s+\d{8}/.test(upperContent)) {
            console.log("[SEPAY WEBHOOK] 📄 Detected INVOICE transaction");
            return invoicePaymentController.sepayWebhookForInvoice(req, res);
        }

        // 3. Trả trước tiền phòng: nội dung chứa "PREPAID"
        // Hỗ trợ format cũ: "PREPAID [code] [DDMMYYYY]"
        // Và format mới: "BIDV;...;PREPAID [code] [DDMMYY] [HHMMSSmmm]"
        if (/PREPAID\s+\S+\s+\d{6,8}(?:\s+\d+)?/.test(upperContent)) {
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
