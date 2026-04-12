/**
 * SEPay Reconciliation Service - Quét định kỳ để phát hiện và xử lý các giao dịch bị bỏ sót
 * 
 * Vấn đề: Hệ thống hiện tại 100% phụ thuộc vào webhook từ Sepay.
 * Nếu webhook không được gọi (lỗi cấu hình, Sepay không nhận diện được giao dịch,
 * hoặc khách nhập nội dung CK hơi khác regex), giao dịch sẽ bị bỏ qua.
 * 
 * Service này chạy định kỳ (mỗi 5 phút) để:
 * 1. Quét tất cả Payment có transferAmount đã đổ vào tài khoản ngân hàng nhưng chưa được xử lý
 * 2. Kiểm tra và xử lý các BookingRequest/Deposit/Invoice đang chờ thanh toán
 * 3. Tự động xử lý các giao dịch "mồ côi" (có tiền vào nhưng chưa match được)
 * 
 * @author HOANG NAM ALMS
 * @date 2026-04-11
 */

const axios = require("axios");

// Models
const BookingRequest = require("../../modules/contract-management/models/booking-request.model");
const Deposit = require("../../modules/contract-management/models/deposit.model");
const Payment = require("../../modules/invoice-management/models/payment.model");
const InvoicePeriodic = require("../../modules/invoice-management/models/invoice_periodic.model");
const InvoiceIncurred = require("../../modules/invoice-management/models/invoice_incurred.model");

// Controllers (để gọi lại logic xử lý)
const bookingRequestController = require("../../modules/contract-management/controllers/booking-request.controller");
const depositController = require("../../modules/room-floor-management/controllers/deposit-room.controller");
const invoicePaymentController = require("../../modules/invoice-management/controllers/invoice-payment.controller");
const prepaidRentController = require("../../modules/prepaid-rent/controllers/prepaid_rent.controller");

// =============================================
// CONFIG
// =============================================
const SEPAY_API_URL = process.env.SEPAY_API_URL || "https://api.sepay.vn";
const SEPAY_API_TOKEN = process.env.SEPAY_API_TOKEN;
const BANK_ACCOUNT = process.env.BANK_ACCOUNT;
const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000; // 5 phút
const LAST_CHECK_KEY = "sepay_reconciliation_last_check";
const TRANSACTION_MAP_KEY = "sepay_transaction_map"; // Lưu map transactionCode -> sepayID đã xử lý

// =============================================
// HELPERS: Lưu trữ đơn giản bằng file (thay vì Redis)
// =============================================
const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "../../../data/sepay_reconciliation_state.json");

function readState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        }
    } catch (err) {
        console.error("[RECON] ❌ Error reading state file:", err.message);
    }
    return { lastCheck: null, processedSepayIds: [] };
}

function writeState(state) {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
        console.error("[RECON] ❌ Error writing state file:", err.message);
    }
}

// =============================================
// STEP 1: Lấy danh sách giao dịch từ Sepay API
// =============================================
async function fetchSepayTransactions(sinceTimestamp) {
    if (!SEPAY_API_TOKEN || !BANK_ACCOUNT) {
        console.warn("[RECON] ⚠️ SEPAY_API_TOKEN or BANK_ACCOUNT not configured. Skipping API fetch.");
        return [];
    }

    try {
        console.log(`[RECON] 🔍 Fetching transactions from Sepay API since ${new Date(sinceTimestamp).toISOString()}...`);
        
        const response = await axios.get(`${SEPAY_API_URL}/transactions`, {
            headers: {
                "Authorization": `Bearer ${SEPAY_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            params: {
                account_number: BANK_ACCOUNT,
                from_date: sinceTimestamp ? new Date(sinceTimestamp).toISOString() : undefined,
                type: "in", // Chỉ lấy giao dịch tiền vào
                limit: 100
            },
            timeout: 30000
        });

        if (response.data && response.data.data) {
            console.log(`[RECON] ✅ Fetched ${response.data.data.length} transactions from Sepay`);
            return response.data.data;
        }
        
        return [];
    } catch (err) {
        console.error("[RECON] ❌ Error fetching Sepay transactions:", err.message);
        if (err.response) {
            console.error("[RECON] Response status:", err.response.status);
            console.error("[RECON] Response data:", JSON.stringify(err.response.data));
        }
        return [];
    }
}

// =============================================
// STEP 2: Parse transactionCode từ nội dung CK
// =============================================
function parseTransactionCode(content) {
    if (!content) return null;
    
    const upperContent = content.toUpperCase();
    
    // Thử parse theo các format khác nhau
    const patterns = [
        { regex: /COC\s+(\S+)\s+(\d{6,10})/i, type: "COC" },
        { regex: /HD\s+(\S+)\s+(\d{6,10})/i, type: "HD" },
        { regex: /PREPAID\s+(\S+)\s+(\d{6,10})/i, type: "PREPAID" },
        // Fallback: thử tìm bất kỳ pattern nào có số
        { regex: /(\S+)\s+(\d{6,10})/i, type: "UNKNOWN" }
    ];

    for (const pattern of patterns) {
        const match = upperContent.match(pattern.regex);
        if (match) {
            // Tạo transactionCode chuẩn hóa
            const transactionCode = match[0];
            return {
                raw: content,
                normalized: transactionCode,
                type: pattern.type,
                roomCode: match[1],
                refNumber: match[2]
            };
        }
    }

    return null;
}

// =============================================
// STEP 3: Xử lý từng loại giao dịch
// =============================================
async function processCocTransaction(transaction) {
    const { content, amount, id: sepayId } = transaction;
    const parsed = parseTransactionCode(content);
    
    if (!parsed || parsed.type !== "COC") {
        console.log(`[RECON] ⚠️ Cannot parse COC transaction: "${content}"`);
        return { success: false, reason: "Cannot parse" };
    }

    const transactionCode = parsed.normalized;
    console.log(`[RECON] 📝 Processing COC: "${transactionCode}", Amount: ${amount}`);

    // 3A: Thử tìm trong BookingRequest trước
    const bookingRequest = await BookingRequest.findOne({ 
        transactionCode: new RegExp(`^${transactionCode}$`, "i") 
    });

    if (bookingRequest) {
        console.log(`[RECON] ✅ Found BookingRequest: ${bookingRequest._id}, Status: ${bookingRequest.status}`);
        
        if (bookingRequest.status === "Awaiting Payment") {
            // Gọi webhook handler để xử lý
            const mockReq = {
                body: {
                    content: transactionCode,
                    transferAmount: amount,
                    transferType: "in",
                    sepayId: sepayId
                }
            };
            const mockRes = {
                status: (code) => mockRes,
                json: (data) => { mockRes._data = data; }
            };
            
            await bookingRequestController.handleSepayWebhook(mockReq, mockRes);
            return { success: true, type: "BookingRequest", id: bookingRequest._id };
        } else if (bookingRequest.status === "Processed") {
            console.log(`[RECON] ℹ️ BookingRequest already processed`);
            return { success: true, type: "BookingRequest", id: bookingRequest._id, alreadyProcessed: true };
        } else {
            console.log(`[RECON] ⚠️ BookingRequest status is "${bookingRequest.status}", expected "Awaiting Payment"`);
            return { success: false, reason: `Status is ${bookingRequest.status}` };
        }
    }

    // 3B: Không tìm thấy BookingRequest → thử Deposit
    const deposit = await Deposit.findOne({ 
        transactionCode: new RegExp(`^${transactionCode}$`, "i") 
    });

    if (deposit) {
        console.log(`[RECON] ✅ Found Deposit: ${deposit._id}, Status: ${deposit.status}`);
        
        if (deposit.status === "Pending") {
            const mockReq = {
                body: {
                    content: transactionCode,
                    transferAmount: amount,
                    transferType: "in",
                    sepayId: sepayId
                }
            };
            const mockRes = {
                status: (code) => mockRes,
                json: (data) => { mockRes._data = data; }
            };
            
            await depositController.sepayWebhook(mockReq, mockRes);
            return { success: true, type: "Deposit", id: deposit._id };
        } else if (deposit.status === "Held") {
            console.log(`[RECON] ℹ️ Deposit already held`);
            return { success: true, type: "Deposit", id: deposit._id, alreadyProcessed: true };
        } else {
            return { success: false, reason: `Deposit status is ${deposit.status}` };
        }
    }

    // 3C: Không tìm thấy cả hai → có thể là giao dịch mới hoặc đã hết hạn
    console.log(`[RECON] ⚠️ No BookingRequest or Deposit found for "${transactionCode}"`);
    
    // Kiểm tra xem đã có Payment record chưa (tránh tạo duplicate)
    const existingPayment = await Payment.findOne({ transactionCode });
    if (existingPayment) {
        if (existingPayment.status === "Success") {
            console.log(`[RECON] ℹ️ Payment already recorded for "${transactionCode}"`);
            return { success: true, type: "Payment", id: existingPayment._id, alreadyProcessed: true };
        }
    }

    // THỬ NGHIỆM: Nếu không tìm thấy record nào, vẫn tạo Payment để admin có thể xử lý thủ công
    // Đánh dấu là "Pending Manual Review" thay vì "Pending" để phân biệt
    console.log(`[RECON] ⚡ Creating orphan payment record for manual review: "${transactionCode}"`);
    
    try {
        const orphanPayment = new Payment({
            amount: amount,
            transactionCode: transactionCode,
            status: "Pending", // Để admin có thể xử lý
            paymentDate: transaction.transactionDate ? new Date(transaction.transactionDate) : new Date(),
            note: "Orphan payment - requires manual review. Please verify and link to correct record."
        });
        await orphanPayment.save();
        
        return { success: true, type: "OrphanPayment", id: orphanPayment._id, requiresManualReview: true };
    } catch (err) {
        console.error(`[RECON] ❌ Error creating orphan payment:`, err.message);
        return { success: false, reason: err.message };
    }
}

async function processInvoiceTransaction(transaction) {
    const { content, amount, id: sepayId } = transaction;
    const parsed = parseTransactionCode(content);
    
    if (!parsed || parsed.type !== "HD") {
        console.log(`[RECON] ⚠️ Cannot parse HD transaction: "${content}"`);
        return { success: false, reason: "Cannot parse" };
    }

    const transactionCode = parsed.normalized;
    console.log(`[RECON] 📝 Processing Invoice: "${transactionCode}", Amount: ${amount}`);

    // Tìm Payment record
    const payment = await Payment.findOne({ 
        transactionCode: new RegExp(`^${transactionCode}$`, "i"),
        status: "Pending"
    });

    if (payment) {
        console.log(`[RECON] ✅ Found Payment: ${payment._id}`);
        
        const mockReq = {
            body: {
                content: transactionCode,
                transferAmount: amount,
                transferType: "in",
                sepayId: sepayId
            }
        };
        const mockRes = {
            status: (code) => mockRes,
            json: (data) => { mockRes._data = data; }
        };
        
        await invoicePaymentController.sepayWebhookForInvoice(mockReq, mockRes);
        return { success: true, type: "InvoicePayment", id: payment._id };
    }

    // Kiểm tra xem đã xử lý chưa
    const existingPayment = await Payment.findOne({ transactionCode });
    if (existingPayment && existingPayment.status === "Success") {
        console.log(`[RECON] ℹ️ Invoice Payment already processed`);
        return { success: true, type: "InvoicePayment", id: existingPayment._id, alreadyProcessed: true };
    }

    console.log(`[RECON] ⚠️ No Pending Payment found for "${transactionCode}"`);
    return { success: false, reason: "No pending payment found" };
}

async function processPrepaidTransaction(transaction) {
    const { content, amount, id: sepayId } = transaction;
    const parsed = parseTransactionCode(content);
    
    if (!parsed || parsed.type !== "PREPAID") {
        console.log(`[RECON] ⚠️ Cannot parse PREPAID transaction: "${content}"`);
        return { success: false, reason: "Cannot parse" };
    }

    const transactionCode = parsed.normalized;
    console.log(`[RECON] 📝 Processing Prepaid Rent: "${transactionCode}", Amount: ${amount}`);

    const mockReq = {
        body: {
            content: transactionCode,
            transferAmount: amount,
            transferType: "in",
            sepayId: sepayId
        }
    };
    const mockRes = {
        status: (code) => mockRes,
        json: (data) => { mockRes._data = data; }
    };
    
    try {
        await prepaidRentController.sepayWebhookForPrepaidRent(mockReq, mockRes);
        return { success: true, type: "PrepaidRent" };
    } catch (err) {
        console.error(`[RECON] ❌ Error processing prepaid rent:`, err.message);
        return { success: false, reason: err.message };
    }
}

// =============================================
// STEP 4: Xử lý giao dịch không khớp format
// =============================================
async function processUnknownTransaction(transaction) {
    const { content, amount, id: sepayId } = transaction;
    
    console.log(`[RECON] ⚠️ Unknown transaction format: "${content}", Amount: ${amount}`);
    
    // Ghi log để admin có thể xem và xử lý thủ công
    // Không tự động tạo record vì không biết loại giao dịch
    
    return { 
        success: false, 
        reason: "Unknown format", 
        requiresManualReview: true,
        content: content,
        amount: amount,
        sepayId: sepayId
    };
}

// =============================================
// STEP 5: Kiểm tra trạng thái không khớp (Orphan payments)
// =============================================
async function checkOrphanPayments() {
    console.log(`[RECON] 🔍 Checking for orphan payments (payments in bank but not matched)...`);
    
    // Tìm các Payment có status = "Success" nhưng BookingRequest/Deposit chưa được xử lý
    // Hoặc BookingRequest có paymentStatus = "Paid" nhưng status không phải "Processed"
    
    const orphanBookings = await BookingRequest.find({
        paymentStatus: "Paid",
        status: { $ne: "Processed" }
    });
    
    if (orphanBookings.length > 0) {
        console.log(`[RECON] ⚠️ Found ${orphanBookings.length} orphan BookingRequests with paymentStatus=Paid`);
        
        for (const br of orphanBookings) {
            console.log(`[RECON] 🔧 Attempting to process orphan BookingRequest: ${br._id}`);
            
            try {
                // Thử gọi createContract
                const contractController = require("../../modules/contract-management/controllers/contract.controller");
                
                const mockReq = {
                    body: {
                        roomId: br.roomId._id || br.roomId,
                        bookingRequestId: br._id,
                        tenantInfo: {
                            fullName: br.name,
                            cccd: br.idCard,
                            phone: br.phone,
                            email: br.email,
                            dob: br.dob,
                            address: br.address,
                            gender: br.gender || "Other"
                        },
                        coResidents: br.coResidents || [],
                        contractDetails: {
                            startDate: br.startDate,
                            duration: br.duration
                        },
                        bookServices: br.servicesInfo || [],
                        prepayMonths: parseInt(br.prepayMonths, 10) || br.duration
                    }
                };
                
                let statusCode = 200;
                const mockRes = {
                    status: (code) => { statusCode = code; return mockRes; },
                    json: () => {}
                };
                
                await contractController.createContract(mockReq, mockRes);
                
                if (statusCode === 201 || statusCode === 200) {
                    await BookingRequest.findByIdAndUpdate(br._id, { status: "Processed" });
                    console.log(`[RECON] ✅ Orphan BookingRequest ${br._id} processed successfully`);
                } else {
                    console.error(`[RECON] ❌ Failed to process orphan BookingRequest ${br._id}: status ${statusCode}`);
                }
            } catch (err) {
                console.error(`[RECON] ❌ Error processing orphan BookingRequest ${br._id}:`, err.message);
            }
        }
    }
    
    return orphanBookings.length;
}

// =============================================
// STEP 6: Kiểm tra hết hạn
// =============================================
async function checkExpiredPayments() {
    console.log(`[RECON] 🔍 Checking for expired payments...`);
    
    const now = new Date();
    
    // Đánh dấu hết hạn BookingRequest
    const expiredBookings = await BookingRequest.find({
        status: "Awaiting Payment",
        paymentExpiresAt: { $lt: now }
    });
    
    for (const br of expiredBookings) {
        console.log(`[RECON] ⏰ Marking expired BookingRequest: ${br._id}`);
        await BookingRequest.findByIdAndUpdate(br._id, { status: "Expired" });
        
        // Cập nhật Payment nếu có
        await Payment.updateMany(
            { bookingRequestId: br._id, status: "Pending" },
            { status: "Failed" }
        );
        
        // Trả phòng về Available
        const Room = require("../../modules/room-floor-management/models/room.model");
        await Room.findByIdAndUpdate(br.roomId, { status: "Available" });
    }
    
    // Đánh dấu hết hạn Deposit
    const expiredDeposits = await Deposit.find({
        status: "Pending",
        expireAt: { $lt: now }
    });
    
    for (const dep of expiredDeposits) {
        console.log(`[RECON] ⏰ Deleting expired Deposit: ${dep._id}`);
        await Deposit.findByIdAndDelete(dep._id);
        
        await Payment.updateMany(
            { depositId: dep._id, status: "Pending" },
            { status: "Failed" }
        );
    }
    
    return { expiredBookings: expiredBookings.length, expiredDeposits: expiredDeposits.length };
}

// =============================================
// MAIN: Reconciliation Job
// =============================================
let reconciliationTimer = null;

async function runReconciliation() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[RECON] 🚀 Starting Sepay Reconciliation Job at ${new Date().toISOString()}`);
    console.log(`${"=".repeat(60)}`);
    
    const state = readState();
    const sinceTimestamp = state.lastCheck || (Date.now() - 60 * 60 * 1000); // Mặc định check 1 giờ trước nếu không có last check
    
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let orphanCount = 0;
    const errors = [];

    try {
        // 1. Lấy transactions từ Sepay API
        const transactions = await fetchSepayTransactions(sinceTimestamp);
        
        if (transactions.length === 0) {
            console.log(`[RECON] ℹ️ No new transactions from Sepay API`);
        }

        // 2. Xử lý từng giao dịch
        for (const tx of transactions) {
            // Bỏ qua nếu đã xử lý rồi
            if (state.processedSepayIds.includes(tx.id)) {
                skippedCount++;
                continue;
            }

            // Bỏ qua giao dịch không phải tiền vào
            if (tx.transferType && tx.transferType !== "in") {
                console.log(`[RECON] ⏭️ Skipping non-incoming transaction: ${tx.id}`);
                skippedCount++;
                continue;
            }

            const parsed = parseTransactionCode(tx.content);
            
            let result;
            if (!parsed) {
                result = await processUnknownTransaction(tx);
            } else if (parsed.type === "COC") {
                result = await processCocTransaction(tx);
            } else if (parsed.type === "HD") {
                result = await processInvoiceTransaction(tx);
            } else if (parsed.type === "PREPAID") {
                result = await processPrepaidTransaction(tx);
            } else {
                result = await processUnknownTransaction(tx);
            }

            processedCount++;

            if (result.success) {
                successCount++;
                if (result.requiresManualReview) orphanCount++;
                
                // Đánh dấu đã xử lý
                state.processedSepayIds.push(tx.id);
                
                // Giới hạn lịch sử processed IDs (chỉ giữ 1000 ID gần nhất)
                if (state.processedSepayIds.length > 1000) {
                    state.processedSepayIds = state.processedSepayIds.slice(-1000);
                }
            } else {
                failedCount++;
                errors.push({
                    sepayId: tx.id,
                    content: tx.content,
                    amount: tx.amount,
                    reason: result.reason
                });
                
                // Vẫn đánh dấu đã xử lý (để không retry liên tục)
                state.processedSepayIds.push(tx.id);
            }
        }

        // 3. Kiểm tra orphan payments (BookingRequest đã paid nhưng chưa processed)
        const orphanProcessed = await checkOrphanPayments();
        
        // 4. Kiểm tra hết hạn
        const expiredResults = await checkExpiredPayments();

        // 5. Cập nhật last check timestamp
        state.lastCheck = Date.now();
        writeState(state);

        // 6. Log summary
        console.log(`\n${"=".repeat(60)}`);
        console.log(`[RECON] 📊 RECONCILIATION SUMMARY`);
        console.log(`${"=".repeat(60)}`);
        console.log(`[RECON] Total transactions fetched: ${transactions.length}`);
        console.log(`[RECON] Processed: ${processedCount}`);
        console.log(`[RECON] ✅ Success: ${successCount}`);
        console.log(`[RECON] ❌ Failed: ${failedCount}`);
        console.log(`[RECON] ⏭️ Skipped (already processed): ${skippedCount}`);
        console.log(`[RECON] ⚠️ Orphan (requires manual review): ${orphanCount}`);
        console.log(`[RECON] ⏰ Expired Bookings marked: ${expiredResults.expiredBookings}`);
        console.log(`[RECON] ⏰ Expired Deposits deleted: ${expiredResults.expiredDeposits}`);
        
        if (errors.length > 0) {
            console.log(`\n[RECON] 📋 Failed transactions:`);
            errors.forEach((err, i) => {
                console.log(`[RECON]   ${i + 1}. SepayID: ${err.sepayId}`);
                console.log(`[RECON]      Content: "${err.content}"`);
                console.log(`[RECON]      Amount: ${err.amount}`);
                console.log(`[RECON]      Reason: ${err.reason}`);
            });
        }
        
        console.log(`${"=".repeat(60)}\n`);

    } catch (error) {
        console.error(`[RECON] ❌ Fatal error during reconciliation:`, error);
        console.error(`[RECON] Stack:`, error.stack);
    }
}

// =============================================
// START/STOP
// =============================================
function startReconciliationJob(intervalMs = RECONCILIATION_INTERVAL_MS) {
    if (reconciliationTimer) {
        console.log(`[RECON] ⚠️ Reconciliation job already running`);
        return;
    }

    console.log(`[RECON] 🚀 Starting Sepay Reconciliation Job (interval: ${intervalMs / 1000 / 60} minutes)`);
    
    // Chạy ngay lập tức lần đầu
    runReconciliation();
    
    // Sau đó chạy định kỳ
    reconciliationTimer = setInterval(runReconciliation, intervalMs);
    
    return reconciliationTimer;
}

function stopReconciliationJob() {
    if (reconciliationTimer) {
        clearInterval(reconciliationTimer);
        reconciliationTimer = null;
        console.log(`[RECON] 🛑 Reconciliation job stopped`);
    }
}

function isRunning() {
    return reconciliationTimer !== null;
}

// =============================================
// MANUAL TRIGGER (dùng cho testing hoặc gọi thủ công)
// =============================================
async function triggerReconciliation(lookbackMinutes = 60) {
    console.log(`[RECON] 🔧 Manual reconciliation triggered (lookback: ${lookbackMinutes} minutes)`);
    
    const state = readState();
    state.lastCheck = Date.now() - (lookbackMinutes * 60 * 1000);
    writeState(state);
    
    await runReconciliation();
}

// =============================================
// EXPORT
// =============================================
module.exports = {
    startReconciliationJob,
    stopReconciliationJob,
    isRunning,
    triggerReconciliation,
    runReconciliation
};
