const express = require("express");
const router = express.Router();
const FinanceController = require("../controllers/finance.controller");

router.get("/dashboard", FinanceController.getDashboard);
router.get("/revenue-report", FinanceController.getRevenueReport);

module.exports = router;