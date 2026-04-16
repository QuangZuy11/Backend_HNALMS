const Room = require("../models/room.model");
const Deposit = require("../../contract-management/models/deposit.model");
const Contract = require("../../contract-management/models/contract.model");
const {
  findSuccessorContractAfterDeclined,
} = require("../../contract-management/services/declinedRenewalSuccessor.service");
const Payment = require("../../invoice-management/models/payment.model");
const { sendEmail } = require("../../notification-management/services/email.service");
const { EMAIL_TEMPLATES } = require("../../../shared/config/email");

// =============================================
// HELPER: Sinh mã giao dịch duy nhất
// Format: Coc [TenPhong] [8 random digits]
// VD: "Coc P114 73920156"
// Dùng random thay vì ngày để tránh trùng khi cọc nhiều lần cùng phòng trong 1 ngày
// =============================================
const generateTransactionCode = (roomName) => {
    const randomStr = String(Math.floor(10000000 + Math.random() * 90000000)); // 8 số ngẫu nhiên

    // Sanitize room name: bỏ dấu, bỏ "Phòng "
    const roomShort = roomName
        .replace(/Phòng\s*/gi, 'P')
        .replace(/[^a-zA-Z0-9]/g, '');

    return `Coc ${roomShort} ${randomStr}`;
};

/** HĐ active đã kích hoạt + renewalStatus declined → cho tối đa 1 cọc mới (không trùng cọc của khách hiện tại). */
async function evaluateDeclinedRenewalNextDeposit(roomObjectId, existingHeldDeposits) {
    const declinedContract = await Contract.findOne({
        roomId: roomObjectId,
        status: "active",
        isActivated: true,
        renewalStatus: "declined",
    }).lean();
    if (!declinedContract) return { next: "none" };

    const successorContract = await findSuccessorContractAfterDeclined(
        declinedContract,
        roomObjectId,
    );
    if (successorContract) {
        return {
            next: "reject",
            body: {
                success: false,
                message:
                    "Đã có hợp đồng kế tiếp cho phòng sau kỳ thuê hiện tại. Không thể đặt thêm cọc.",
            },
        };
    }

    const tenantADepositId = declinedContract.depositId?.toString();

    // Lấy tất cả HĐ chưa kích hoạt để biết deposit nào đã bind vào HĐ tương lai (vd HĐ 464)
    const inactiveContracts = await Contract.find({
        roomId: roomObjectId,
        isActivated: false,
        status: { $nin: ["terminated", "expired"] },
    }).select("depositId").lean();

    const depositsBoundToInactive = new Set(
        inactiveContracts
            .filter((c) => c.depositId)
            .map((c) => c.depositId.toString())
    );

    // extraHeld: loại bỏ cọc của HĐ 622 (tenantA) VÀ cọc đã bind vào HĐ 464 (chưa kích hoạt)
    const extraHeld = existingHeldDeposits.filter(
        (d) =>
            (!tenantADepositId || d._id.toString() !== tenantADepositId) &&
            !depositsBoundToInactive.has(d._id.toString()),
    );
    if (extraHeld.length > 0) {
        return {
            next: "reject",
            body: {
                success: false,
                message:
                    "Phòng đã có người đặt cọc cho kỳ thuê tiếp theo. Không thể tạo thêm cọc.",
            },
        };
    }
    const pendingOthers = await Deposit.countDocuments({
        room: roomObjectId,
        status: "Pending",
    });
    if (pendingOthers > 0) {
        return {
            next: "reject",
            body: {
                success: false,
                message: "Đang có giao dịch đặt cọc chờ thanh toán cho phòng này.",
            },
        };
    }
    return { next: "allow" };
}

// =============================================
// POST /api/deposits/initiate
// Bước 1: Khách điền form → hệ thống sinh mã & trả về QR chuyển khoản
// =============================================
exports.initiateDeposit = async (req, res) => {
    try {
        const { 
            roomId, name, phone, email, 
            idCard, dob, address, gender, startDate, duration, prepayMonths, coResidents 
        } = req.body;

        // --- Validate input ---
        if (!roomId || !name || !phone || !email || !idCard || !startDate) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng điền đầy đủ thông tin bắt buộc: roomId, name, phone, email, idCard, startDate",
            });
        }

        // --- Lấy thông tin phòng + giá từ roomType ---
        const room = await Room.findById(roomId).populate("roomTypeId");
        if (!room) {
            return res.status(404).json({ success: false, message: "Không tìm thấy phòng" });
        }

        let allowDeposit = false;
        let allowShortTermDeposit = false;

        // Lấy tất cả deposit đang Held của phòng này
        const existingHeldDeposits = await Deposit.find({
            room: room._id,
            status: "Held",
        });

        if (room.status === "Available") {
            // Phòng trống hoàn toàn → cho phép đặt cọc
            allowDeposit = true;
        } else if (room.status === "Occupied") {
            const ev = await evaluateDeclinedRenewalNextDeposit(room._id, existingHeldDeposits);
            if (ev.next === "reject") return res.status(400).json(ev.body);
            if (ev.next === "allow") allowDeposit = true;
        } else if (room.status === "Deposited") {
            // Phòng đang deposited → kiểm tra các hợp đồng
            const futureContracts = await Contract.find({
                roomId: room._id,
                status: "active",
                isActivated: false,
                startDate: { $gt: new Date() },
            }).sort({ startDate: 1 });

            if (futureContracts.length > 0) {
                // Lấy hợp đồng sắp tới gần nhất
                const nearestFuture = futureContracts[0];
                const daysUntilStart = Math.ceil(
                    (new Date(nearestFuture.startDate) - new Date()) / (1000 * 60 * 60 * 24)
                );

                if (daysUntilStart < 30) {
                    // Còn < 30 ngày → KHÔNG cho cọc nữa
                    return res.status(400).json({
                        success: false,
                        message: `Không thể đặt cọc: Hợp đồng mới sẽ bắt đầu vào ngày ${new Date(nearestFuture.startDate).toLocaleDateString("vi-VN")} (còn ${daysUntilStart} ngày). Thời hạn tối thiểu để đặt cọc mới là 30 ngày.`,
                    });
                }

                // >= 30 ngày → cho phép cọc ngắn hạn
                // Reset các deposit cũ chưa active về activationStatus = false
                for (const dep of existingHeldDeposits) {
                    if (dep.activationStatus !== true) {
                        dep.activationStatus = false;
                        await dep.save();
                        console.log(`[INITIATE DEPOSIT] Reset deposit ${dep.transactionCode} → activationStatus=false`);
                    }
                }
                allowShortTermDeposit = true;
            } else {
                // Không có future contract đang chờ nhưng room = Deposited
                // Có thể là contract đã active rồi → không cho cọc
                const activeContracts = await Contract.findOne({
                    roomId: room._id,
                    status: "active",
                    isActivated: true,
                }).lean();
                if (activeContracts) {
                    // DB status vẫn Deposited khi khách từ chối gia hạn (API chi tiết phòng không ghi đè Occupied).
                    if (activeContracts.renewalStatus === "declined") {
                        const ev = await evaluateDeclinedRenewalNextDeposit(
                            room._id,
                            existingHeldDeposits,
                        );
                        if (ev.next === "reject") return res.status(400).json(ev.body);
                        if (ev.next === "allow") allowDeposit = true;
                    } else {
                        return res.status(400).json({
                            success: false,
                            message: "Phòng đang có người thuê, không thể đặt cọc.",
                        });
                    }
                } else {
                    // Trường hợp hy hữu: Deposited nhưng không có contract nào
                    // Reset tất cả deposit cũ, cho phép cọc mới
                    for (const dep of existingHeldDeposits) {
                        dep.activationStatus = false;
                        await dep.save();
                    }
                    allowDeposit = true;
                }
            }
        }

        if (room.status !== "Available" && !allowDeposit && !allowShortTermDeposit) {
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

        // --- Lấy thông tin ---
        const transactionCode = generateTransactionCode(room.name);

        // --- Tính thời gian hết hạn (24 giờ từ bây giờ vì là gửi yêu cầu) ---
        const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 giờ

        // --- Lưu Deposit vào DB với status "Pending", activationStatus = null (chờ kích hoạt) ---
        const deposit = new Deposit({
            name,
            phone,
            email,
            room: roomId,
            amount: depositAmount,
            status: "Pending",
            transactionCode,
            expireAt,
            activationStatus: null, // Chưa active, sẽ được set khi contract kích hoạt
            idCard,
            dob: dob ? new Date(dob) : null,
            address,
            gender: gender || "Other",
            startDate: new Date(startDate),
            duration: parseInt(duration, 10) || 12,
            prepayMonths: prepayMonths === "all" ? "all" : (parseInt(prepayMonths, 10) || 2),
            coResidents: Array.isArray(coResidents) ? coResidents : [],
        });
        await deposit.save();

        // --- Tạo QR Code URL theo chuẩn VietQR ---
        const bankBin = process.env.BANK_BIN;
        const bankAccount = process.env.BANK_ACCOUNT;
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
        // Auth đã được xử lý bởi middleware verifySepayToken (src/shared/routes/sepay-webhook.routes.js)

        // --- Parse dữ liệu từ Sepay ---
        const {
            id,             // ID giao dịch trên Sepay
            transferAmount, // Số tiền chuyển khoản
            content,        // Nội dung chuyển khoản (chứa transactionCode)
            transferType,   // "in" = tiền vào, "out" = tiền ra
        } = req.body;

        // --- 3. Tìm Deposit bằng transactionCode trong nội dung CK ---
        // Format: "Coc P310 73920156" (8 random digits, không còn theo ngày)
        // Regex: Coc + tên phòng + 8 số ngẫu nhiên
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

        // --- 5. Cập nhật trạng thái Deposit → "Held" + Thiết lập hết hạn 30 ngày ---
        deposit.status = "Held";
        // Thiết lập hết hạn = 30 ngày kể từ thanh toán thành công
        deposit.expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 ngày
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

        // --- 9. Tự động tạo Hợp Đồng (nếu là giao dịch đặt phòng online có idCard) ---
        if (deposit.idCard && deposit.startDate) {
            console.log(`[SEPAY WEBHOOK] ⚡ Đang tiến hành tạo hợp đồng tự động cho giao dịch ${transactionCode}...`);
            const contractController = require("../../contract-management/controllers/contract.controller");
            
            const mockReq = {
                body: {
                    roomId: deposit.room._id || deposit.room,
                    depositId: deposit._id,
                    tenantInfo: {
                        fullName: deposit.name,
                        cccd: deposit.idCard,
                        phone: deposit.phone,
                        email: deposit.email,
                        dob: deposit.dob,
                        address: deposit.address,
                        gender: deposit.gender || "Other"
                    },
                    coResidents: deposit.coResidents || [],
                    contractDetails: {
                        startDate: deposit.startDate,
                        duration: deposit.duration
                    },
                    bookServices: [],
                    prepayMonths: parseInt(deposit.prepayMonths, 10) || deposit.duration
                }
            };

            let contractResponseStatus = 200;
            let contractResponseData = {};

            const mockRes = {
                status: (code) => {
                    contractResponseStatus = code;
                    return mockRes;
                },
                json: (data) => {
                    contractResponseData = data;
                }
            };

            try {
                await contractController.createContract(mockReq, mockRes);
                if (contractResponseStatus === 201 || contractResponseStatus === 200) {
                    console.log(`[SEPAY WEBHOOK] ✅ Hợp đồng tạo tự động THÀNH CÔNG cho Deposit ${deposit._id}.`);
                } else {
                    console.error(`[SEPAY WEBHOOK] ❌ Lỗi tạo hợp đồng tự động cho Deposit:`, contractResponseData);
                }
            } catch (err) {
                console.error(`[SEPAY WEBHOOK] ❌ Lỗi Fatal tạo hợp đồng:`, err.message);
            }
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
