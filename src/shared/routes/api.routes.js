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

// Mount routes
ApiRouter.use("/auth", authRoutes);
ApiRouter.use("/", roomRoutes);

module.exports = ApiRouter;
