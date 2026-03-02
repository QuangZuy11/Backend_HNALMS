const express = require("express");
const router = express.Router();
const depositController = require("../controllers/deposit.controller");

// Get all deposits
router.get("/", depositController.getAllDeposits);

// Create a new deposit
router.post("/", depositController.createDeposit);

// Get deposit by ID
router.get("/:id", depositController.getDepositById);

module.exports = router;
