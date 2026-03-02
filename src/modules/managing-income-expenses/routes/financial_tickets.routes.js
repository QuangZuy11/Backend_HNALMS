const express = require("express");
const router = express.Router();

const { authenticate } = require("../../authentication/middlewares/authenticate");
const { authorize } = require("../../authentication/middlewares/authorize");
const financialTicketsController = require("../controllers/financial_tickets.controller");

// Danh sách phiếu chi (Payment) - chỉ dành cho kế toán
router.get(
  "/payments",
  authenticate,
  authorize("accountant"),
  financialTicketsController.getPaymentTickets
);

module.exports = router;

