const express = require("express");
const router = express.Router();
const contractController = require("../controllers/contract.controller");

// Route to create a new contract
router.post("/create", contractController.createContract);

// Add other routes here (e.g., get list, get detail, etc.)

// Route to get all contracts
router.get("/", contractController.getAllContracts);
router.get("/:id", contractController.getContractById);

module.exports = router;
