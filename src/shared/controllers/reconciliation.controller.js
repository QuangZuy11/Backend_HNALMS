/**
 * Reconciliation Controller - API endpoint để quản lý reconciliation job
 * 
 * Cung cấp các endpoint để:
 * - Kiểm tra trạng thái job
 * - Chạy reconciliation thủ công
 * - Xem lịch sử các giao dịch bị bỏ sót
 */

const {
    isRunning,
    triggerReconciliation,
    runReconciliation
} = require("../services/sepay-reconciliation.service");

// =============================================
// GET /api/reconciliation/status
// Kiểm tra trạng thái reconciliation job
// =============================================
exports.getStatus = async (req, res) => {
    try {
        const fs = require("fs");
        const path = require("path");
        const stateFile = path.join(__dirname, "../../../data/sepay_reconciliation_state.json");
        
        let state = {
            lastCheck: null,
            processedSepayIds: []
        };
        
        if (fs.existsSync(stateFile)) {
            try {
                state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
            } catch (err) {
                console.error("[RECON API] Error reading state:", err.message);
            }
        }
        
        return res.status(200).json({
            success: true,
            data: {
                jobRunning: isRunning(),
                lastCheck: state.lastCheck ? new Date(state.lastCheck).toISOString() : null,
                lastCheckAgo: state.lastCheck 
                    ? `${Math.round((Date.now() - state.lastCheck) / 1000 / 60)} phút trước` 
                    : "Chưa bao giờ",
                processedCount: state.processedSepayIds.length,
                config: {
                    intervalMinutes: parseInt(process.env.RECONCILIATION_INTERVAL_MINUTES || "5", 10),
                    sepayApiConfigured: !!process.env.SEPAY_API_TOKEN
                }
            }
        });
    } catch (error) {
        console.error("[RECON API] Error getting status:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi khi lấy trạng thái reconciliation"
        });
    }
};

// =============================================
// POST /api/reconciliation/run
// Chạy reconciliation thủ công
// =============================================
exports.runManually = async (req, res) => {
    try {
        const { lookbackMinutes = 60 } = req.body;
        
        console.log(`[RECON API] 🔧 Manual reconciliation triggered by admin (lookback: ${lookbackMinutes} minutes)`);
        
        // Chạy async nhưng return response ngay
        // Frontend có thể polling /status để xem kết quả
        triggerReconciliation(lookbackMinutes).catch(err => {
            console.error("[RECON API] ❌ Reconciliation error:", err);
        });
        
        return res.status(202).json({
            success: true,
            message: `Reconciliation đang được chạy (lookback: ${lookbackMinutes} phút)`,
            note: "Kết quả sẽ được ghi log. Kiểm tra trạng thái tại /api/reconciliation/status"
        });
    } catch (error) {
        console.error("[RECON API] Error running reconciliation:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi khi chạy reconciliation"
        });
    }
};

// =============================================
// GET /api/reconciliation/orphans
// Lấy danh sách các payment bị orphan (chưa xử lý)
// =============================================
exports.getOrphanPayments = async (req, res) => {
    try {
        const Payment = require("../../modules/invoice-management/models/payment.model");
        const BookingRequest = require("../../modules/contract-management/models/booking-request.model");
        
        // Tìm các BookingRequest đã paid nhưng chưa processed
        const orphanBookings = await BookingRequest.find({
            paymentStatus: "Paid",
            status: { $ne: "Processed" }
        }).populate("roomId", "name");
        
        // Tìm các Payment có note chứa "Orphan"
        const orphanPayments = await Payment.find({
            note: { $regex: /orphan/i },
            status: "Pending"
        }).populate([
            { path: "bookingRequestId", select: "name email" },
            { path: "depositId", select: "name email" },
            { path: "invoiceId", select: "invoiceCode totalAmount" },
            { path: "incurredInvoiceId", select: "invoiceCode totalAmount" }
        ]);
        
        return res.status(200).json({
            success: true,
            data: {
                orphanBookings: orphanBookings.map(br => ({
                    _id: br._id,
                    name: br.name,
                    email: br.email,
                    room: br.roomId?.name,
                    totalAmount: br.totalAmount,
                    transactionCode: br.transactionCode,
                    paymentStatus: br.paymentStatus,
                    status: br.status,
                    createdAt: br.createdAt
                })),
                orphanPayments: orphanPayments.map(p => ({
                    _id: p._id,
                    amount: p.amount,
                    transactionCode: p.transactionCode,
                    status: p.status,
                    paymentDate: p.paymentDate,
                    note: p.note,
                    linkedTo: p.bookingRequestId 
                        ? `BookingRequest: ${p.bookingRequestId.name}` 
                        : p.depositId 
                            ? `Deposit: ${p.depositId.name}`
                            : p.invoiceId 
                                ? `Invoice: ${p.invoiceId.invoiceCode}`
                                : p.incurredInvoiceId 
                                    ? `IncurredInvoice: ${p.incurredInvoiceId.invoiceCode}`
                                    : "Không xác định"
                }))
            }
        });
    } catch (error) {
        console.error("[RECON API] Error getting orphan payments:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi khi lấy danh sách orphan payments"
        });
    }
};

// =============================================
// POST /api/reconciliation/process-orphan/:paymentId
// Xử lý một orphan payment cụ thể
// =============================================
exports.processOrphan = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { transactionCode, amount } = req.body;
        
        const Payment = require("../../modules/invoice-management/models/payment.model");
        const BookingRequest = require("../../modules/contract-management/models/booking-request.model");
        
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy payment"
            });
        }
        
        // Tìm BookingRequest liên quan
        if (payment.bookingRequestId) {
            const bookingRequest = await BookingRequest.findById(payment.bookingRequestId);
            if (bookingRequest) {
                const contractController = require("../../modules/contract-management/controllers/contract.controller");
                
                const mockReq = {
                    body: {
                        roomId: bookingRequest.roomId._id || bookingRequest.roomId,
                        bookingRequestId: bookingRequest._id,
                        tenantInfo: {
                            fullName: bookingRequest.name,
                            cccd: bookingRequest.idCard,
                            phone: bookingRequest.phone,
                            email: bookingRequest.email,
                            dob: bookingRequest.dob,
                            address: bookingRequest.address,
                            gender: bookingRequest.gender || "Other"
                        },
                        coResidents: bookingRequest.coResidents || [],
                        contractDetails: {
                            startDate: bookingRequest.startDate,
                            duration: bookingRequest.duration
                        },
                        bookServices: bookingRequest.servicesInfo || [],
                        prepayMonths: parseInt(bookingRequest.prepayMonths, 10) || bookingRequest.duration
                    }
                };
                
                let statusCode = 200;
                const mockRes = {
                    status: (code) => { statusCode = code; return mockRes; },
                    json: () => {}
                };
                
                await contractController.createContract(mockReq, mockRes);
                
                if (statusCode === 201 || statusCode === 200) {
                    await BookingRequest.findByIdAndUpdate(bookingRequest._id, { 
                        status: "Processed",
                        paymentStatus: "Paid"
                    });
                    payment.status = "Success";
                    payment.paymentDate = payment.paymentDate || new Date();
                    await payment.save();
                    
                    return res.status(200).json({
                        success: true,
                        message: "Đã xử lý orphan payment thành công"
                    });
                }
            }
        }
        
        return res.status(400).json({
            success: false,
            message: "Không thể xử lý orphan payment - không tìm thấy BookingRequest liên quan"
        });
    } catch (error) {
        console.error("[RECON API] Error processing orphan:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi khi xử lý orphan payment"
        });
    }
};
