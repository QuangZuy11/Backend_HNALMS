const express = require("express");
const router = express.Router();
const FinanceController = require("../controllers/finance.controller");

// Route: GET /api/finance/dashboard?month=3&year=2026
router.get("/dashboard", FinanceController.getDashboard);

module.exports = router;