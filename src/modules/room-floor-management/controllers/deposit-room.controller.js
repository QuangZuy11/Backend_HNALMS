const Room = require("../models/room.model");
const Deposit = require("../../contract-management/models/deposit.model");
const Payment = require("../../invoice-management/models/payment.model");
const { sendEmail } = require("../../notification-management/services/email.service");
const { EMAIL_TEMPLATES } = require("../../../shared/config/email");

// =============================================
// HELPER: Sinh mã giao dịch duy nhất
// Format: Coc [TenPhong] [DDMMYYYY]
// VD: "Coc P310 02032026"
// =============================================
const generateTransactionCode = (roomName) => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`; // DDMMYYYY

    // Sanitize room name: bỏ dấu, bỏ "Phòng " 
    const roomShort = roomName
        .replace(/Phòng\s*/gi, 'P')
        .replace(/[^a-zA-Z0-9]/g, '');

    return `Coc ${roomShort} ${dateStr}`;
};

// =============================================
// POST /api/deposits/initiate
// Bước 1: Khách điền form → hệ thống sinh mã & trả về QR chuyển khoản
// =============================================
exports.initiateDeposit = async (req, res) => {
    try {
        const { roomId, name, phone, email } = req.body;

        // --- Validate input ---
        if (!roomId || !name || !phone || !email) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng điền đầy đủ thông tin: roomId, name, phone, email",
            });
        }

        // --- Lấy thông tin phòng + giá từ roomType ---
        const room = await Room.findById(roomId).populate("roomTypeId");
        if (!room) {
            return res.status(404).json({ success: false, message: "Không tìm thấy phòng" });
        }
        if (room.status !== "Available") {
            return res.status(400).json({
                success: false,
                message: `Phòng hiện không thể đặt cọc (trạng thái: ${room.status})`,
            });
        }

        // --- Tính số tiền đặt cọc = 1 tháng tiền phòng ---
        const depositAmount = parseFloat(room.roomTypeId?.currentPrice?.toString() || "0");
        if (depositAmount <= 0) {
            return res.status(400).json({ success: false, message: "Không thể đọc giá phòng" });
        }

        // --- Sinh mã giao dịch ---
        const transactionCode = generateTransactionCode(room.name);

        // --- Tính thời gian hết hạn (5 phút từ bây giờ) ---
        const expireAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút

        // --- Lưu Deposit vào DB với status "Pending" ---
        const deposit = new Deposit({
            name,
            phone,
            email,
            room: roomId,
            amount: depositAmount,
            status: "Pending",
            transactionCode,
            expireAt,
        });
        await deposit.save();

        // --- Tạo QR Code URL theo chuẩn VietQR ---
        // Cú pháp: https://img.vietqr.io/image/{BANK_BIN}-{ACCOUNT_NUMBER}-qr_only.jpg
        //           ?amount={amount}&addInfo={transactionCode}&accountName={name}
        const bankBin = process.env.BANK_BIN;           // VD: "970418" (BIDV)
        const bankAccount = process.env.BANK_ACCOUNT;   // VD: "12345678901"
        const bankAccountName = encodeURIComponent(
            process.env.BANK_ACCOUNT_NAME || "HOANG NAM ALMS"
        );
        const encodedContent = encodeURIComponent(transactionCode);

        const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-qr_only.jpg?amount=${depositAmount}&addInfo=${encodedContent}&accountName=${bankAccountName}`;

        return res.status(201).json({
            success: true,
            message: "Khởi tạo đặt cọc thành công. Vui lòng quét QR để thanh toán.",
            data: {
                depositId: deposit._id,
                transactionCode,
                depositAmount,
                roomName: room.name,
                qrUrl,
                bankInfo: {
                    bankBin,
                    bankAccount,
                    bankAccountName: process.env.BANK_ACCOUNT_NAME || "HOANG NAM ALMS",
                    content: transactionCode,
                },
                expireAt: deposit.expireAt,
                expireInSeconds: Math.max(0, Math.floor((deposit.expireAt - Date.now()) / 1000)),
                expireNote: "Giao dịch cần được xác nhận trong 5 phút",
            },
        });
    } catch (error) {
        console.error("Initiate Deposit Error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal Server Error" });
    }
};

// =============================================
// GET /api/deposits/status/:transactionCode
// Bước polling: FE gọi mỗi vài giây để kiểm tra trạng thái thanh toán
// =============================================
exports.getDepositStatus = async (req, res) => {
    try {
        const { transactionCode } = req.params;

        const deposit = await Deposit.findOne({ transactionCode }).populate("room", "name status");
        if (!deposit) {
            return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch hoặc giao dịch đã hết hạn" });
        }

        // --- Kiểm tra hết hạn 5 phút và xóa deposit ---
        if (deposit.status === "Pending" && deposit.expireAt && new Date() > deposit.expireAt) {
            // XÓA deposit (không tạo Payment)
            await Deposit.findByIdAndDelete(deposit._id);

            return res.status(200).json({
                success: true,
                data: {
                    status: "Expired",
                    message: "Giao dịch đã hết hạn thanh toán",
                    transactionCode,
                },
            });
        }

        // Tính thời gian còn lại
        const expireInSeconds = deposit.expireAt
            ? Math.max(0, Math.floor((deposit.expireAt - Date.now()) / 1000))
            : 0;

        return res.status(200).json({
            success: true,
            data: {
                status: deposit.status,          // "Pending" | "Held" | "Expired"
                depositId: deposit._id,
                transactionCode: deposit.transactionCode,
                amount: deposit.amount,
                room: deposit.room,
                expireAt: deposit.expireAt,
                expireInSeconds,
            },
        });
    } catch (error) {
        console.error("Get Deposit Status Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// =============================================
// POST /api/sepay/webhook
// Sepay gọi endpoint này khi phát hiện biến động số dư ngân hàng
// Cấu hình tại: app.sepay.vn → Tích hợp → Webhook
// =============================================
exports.sepayWebhook = async (req, res) => {
    try {
        // --- 1. Xác thực webhook API Key ---
        // Sepay gửi header: Authorization: Apikey <API_KEY>
        const authHeader = req.headers["authorization"];
        const expectedKey = `Apikey ${process.env.SEPAY_WEBHOOK_TOKEN}`;

        if (!authHeader || authHeader !== expectedKey) {
            console.warn("[SEPAY WEBHOOK] ❌ Unauthorized webhook call. Received:", authHeader);
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        // --- 2. Parse dữ liệu từ Sepay ---
        const {
            id,             // ID giao dịch trên Sepay
            transferAmount, // Số tiền chuyển khoản
            content,        // Nội dung chuyển khoản (chứa transactionCode)
            transferType,   // "in" = tiền vào, "out" = tiền ra
        } = req.body;

        console.log("[SEPAY WEBHOOK] 📥 Received:", JSON.stringify(req.body, null, 2));

        // Chỉ xử lý giao dịch tiền VÀO
        if (transferType !== "in") {
            return res.status(200).json({ success: true, message: "Ignored outgoing transaction" });
        }

        // --- 3. Tìm Deposit bằng transactionCode trong nội dung CK ---
        // Format: "Coc P310 02032026"
        // Regex: Coc + tên phòng + ngày (8 số)
        const matchCode = content.match(/Coc\s+\S+\s+\d{8}/i);
        if (!matchCode) {
            console.warn("[SEPAY WEBHOOK] ⚠️ Không tìm thấy mã giao dịch trong nội dung:", content);
            return res.status(200).json({ success: true, message: "No matching transaction code" });
        }
        const transactionCode = matchCode[0];

        const deposit = await Deposit.findOne({ transactionCode, status: "Pending" }).populate("room");
        if (!deposit) {
            console.warn("[SEPAY WEBHOOK] ⚠️ Deposit không tồn tại hoặc đã xử lý:", transactionCode);
            return res.status(200).json({ success: true, message: "Deposit not found or already processed" });
        }

        // --- 4. Kiểm tra số tiền (cho phép sai lệch ±1000đ) ---
        const diff = Math.abs(transferAmount - deposit.amount);
        if (diff > 1000) {
            console.warn(`[SEPAY WEBHOOK] ⚠️ Số tiền không khớp: nhận ${transferAmount}, cần ${deposit.amount}`);
            // Vẫn trả 200 để Sepay không retry, nhưng không xử lý
            return res.status(200).json({ success: true, message: "Amount mismatch" });
        }

        // --- 5. Cập nhật trạng thái Deposit → "Held" + Thiết lập hết hạn 7 ngày ---
        deposit.status = "Held";
        // Thiết lập hết hạn = 7 ngày kể từ thanh toán thành công
        deposit.expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await deposit.save();

        // --- 6. Tạo Payment record với status "Success" ---
        const payment = new Payment({
            depositId: deposit._id,
            amount: transferAmount,
            transactionCode: transactionCode,
            status: "Success",
            paymentDate: new Date(),
        });
        await payment.save();
        console.log(`[SEPAY WEBHOOK] ✅ Payment created: ${payment._id}`);

        // --- 7. Cập nhật trạng thái Phòng → "Deposited" ---
        const roomForCode = await Room.findById(deposit.room._id || deposit.room);
        if (roomForCode) {
            roomForCode.status = "Deposited";
            await roomForCode.save();
            console.log(`[SEPAY WEBHOOK] ✅ Phòng ${roomForCode.name} → Deposited`);
        }

        // --- 8. Gửi email xác nhận cho khách ---
        try {
            const roomName = roomForCode ? roomForCode.name : "N/A";
            const emailContent = EMAIL_TEMPLATES.DEPOSIT_CONFIRMATION.getHtml(
                deposit.name,
                roomName,
                deposit.amount,
                transactionCode
            );
            await sendEmail(deposit.email, EMAIL_TEMPLATES.DEPOSIT_CONFIRMATION.subject, emailContent);
            console.log(`[SEPAY WEBHOOK] ✅ Email xác nhận đã gửi đến ${deposit.email}`);
        } catch (emailErr) {
            console.error("[SEPAY WEBHOOK] ❌ Lỗi gửi email:", emailErr.message);
            // Không throw, tiếp tục trả về success
        }

        return res.status(200).json({ success: true, message: "Deposit confirmed successfully" });

    } catch (error) {
        console.error("[SEPAY WEBHOOK] ❌ Error:", error);
        // PHẢI trả 200 để Sepay không retry liên tục
        return res.status(200).json({ success: false, message: "Internal error" });
    }
};

// =============================================
// POST /api/deposits/cancel/:transactionCode
// Frontend gọi khi user đóng modal thanh toán (hủy giao dịch)
// =============================================
exports.cancelDeposit = async (req, res) => {
    try {
        const { transactionCode } = req.params;

        // --- Tìm deposit ---
        const deposit = await Deposit.findOne({ transactionCode });
        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy giao dịch",
            });
        }

        // --- Chỉ cho phép hủy deposit đang Pending ---
        if (deposit.status !== "Pending") {
            return res.status(400).json({
                success: false,
                message: `Không thể hủy giao dịch đã ${deposit.status}`,
            });
        }

        // --- XÓA deposit (không lưu Payment vì user chủ động hủy) ---
        await Deposit.findByIdAndDelete(deposit._id);
        console.log(`[CANCEL DEPOSIT] Deposit deleted: ${transactionCode}`);

        return res.status(200).json({
            success: true,
            message: "Đã hủy giao dịch đặt cọc",
            data: {
                transactionCode,
                status: "Cancelled",
            },
        });
    } catch (error) {
        console.error("Cancel Deposit Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
