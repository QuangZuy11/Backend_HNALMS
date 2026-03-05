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
const depositRoutes = require("../../modules/contract-management/routes/deposit.routes");
const accountRoutes = require("../../modules/account-management/routes/account.routes");

ApiRouter.use("/contracts", contractRoutes);
ApiRouter.use("/deposits", depositRoutes);
ApiRouter.use("/accounts", accountRoutes);
ApiRouter.use("/devices", deviceRoutes);
ApiRouter.use("/invoices", invoiceRoutes);
ApiRouter.use("/meter-readings", meterreadingRoutes);

// Webhook chung cho Sepay (1 URL duy nhất cho tất cả loại thanh toán)
const sepayWebhookRoutes = require("./sepay-webhook.routes");
ApiRouter.use("/webhook", sepayWebhookRoutes);
ApiRouter.use("/financial-tickets", financialTicketRoutes);

const roomDepositRoutes = require("../../modules/room-floor-management/routes/deposit-room.routes");
ApiRouter.use("/deposits", roomDepositRoutes);

module.exports = ApiRouter;
