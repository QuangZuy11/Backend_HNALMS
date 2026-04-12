const express = require("express");
const db = require("../models");

const ApiRouter = express.Router();
const authRoutes = require("../../modules/authentication/routes/auth.routes");

// Health check
ApiRouter.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

// Get all users (for testing)
ApiRouter.get("/users", async (req, res) => {
  try {
    const users = await db.User.find().select("-password");
    res.json({
      success: true,
      total: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        status: 500,
        message: error.message,
      },
    });
  }
});

// Import routes từ modules
const roomRoutes = require("../../modules/room-floor-management/routes/room-floor.routes");
const buildingRoutes = require("../../modules/building-information/routes/building.routes");
const serviceRoutes = require("../../modules/service-management/routes/service.routes");
const requestRoutes = require("../../modules/request-management/routes/request.routes");
const uploadRoutes = require("../../modules/request-management/routes/upload.routes");

const deviceRoutes = require("../../modules/room-floor-management/routes/device.route");
const invoiceRoutes = require("../../modules/invoice-management/routes/invoice.routes");
const meterreadingRoutes = require("../../modules/invoice-management/routes/meterreading.routes");
const financialTicketRoutes = require("../../modules/managing-income-expenses/routes/financial_tickets.routes");
// Mount routes
ApiRouter.use("/auth", authRoutes);
ApiRouter.use("/", roomRoutes);
ApiRouter.use("/buildings", buildingRoutes);
ApiRouter.use("/services", serviceRoutes);
ApiRouter.use("/requests", requestRoutes);
ApiRouter.use("/upload", uploadRoutes);

const contractRoutes = require("../../modules/contract-management/routes/contract.routes");
// NOTE: deposit.routes.js (contract-management) đã bị xóa khỏi đây vì xung đột với deposit-room.routes.js
// Các API quản lý deposit cũ (GET /, POST /, GET /:id) đã được gộp vào roomDepositRoutes bên dưới
const bookingRequestRoutes = require("../../modules/contract-management/routes/booking-request.routes");
const moveOutRoutes = require("../../modules/contract-management/routes/moveout_request.routes");
const accountRoutes = require("../../modules/account-management/routes/account.routes");
const liquidationRoutes = require("../../modules/contract-management/routes/liquidation.routes");

ApiRouter.use("/contracts", contractRoutes);
ApiRouter.use("/renewals", require("../../modules/contract-management/routes/renewal.routes"));
ApiRouter.use("/booking-requests", bookingRequestRoutes);
ApiRouter.use("/move-outs", moveOutRoutes);
ApiRouter.use("/accounts", accountRoutes);
ApiRouter.use("/liquidations", liquidationRoutes);
ApiRouter.use("/devices", deviceRoutes);
ApiRouter.use("/invoices", invoiceRoutes);
ApiRouter.use("/meter-readings", meterreadingRoutes);

// Webhook chung cho Sepay (1 URL duy nhất cho tất cả loại thanh toán)
const sepayWebhookRoutes = require("./sepay-webhook.routes");
ApiRouter.use("/webhook", sepayWebhookRoutes);
ApiRouter.use("/financial-tickets", financialTicketRoutes);

// /deposits: chỉ dùng deposit-room.routes.js (có /initiate, /status/:code, /cancel/:code)
// Đây là route /deposits duy nhất — không được mount thêm route /deposits nào khác!
const roomDepositRoutes = require("../../modules/room-floor-management/routes/deposit-room.routes");
ApiRouter.use("/deposits", roomDepositRoutes);

const notificationRoutes = require("../../modules/notification-management/routes/notification.routes");
ApiRouter.use("/notifications", notificationRoutes);

// Test routes ( không cần auth)
const testRoutes = require("./test-routes");
ApiRouter.use("/test", testRoutes);

// Report routes
const reportRoutes = require("../../modules/report-management/routes/report.routes");
ApiRouter.use("/reports", reportRoutes);

const financeRoute = require('../../modules/report-management/routes/finance.routes');
ApiRouter.use("/finance", financeRoute);

const prepaidRentRoutes = require("../../modules/prepaid-rent/routes/prepaid_rent.routes");
ApiRouter.use("/prepaid-rent", prepaidRentRoutes);

// Reconciliation routes - tạm thời disabled (cần SEPAY_API_TOKEN)
// const reconciliationRoutes = require("./reconciliation.routes");
// ApiRouter.use("/reconciliation", reconciliationRoutes);

module.exports = ApiRouter;
