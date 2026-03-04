const express = require("express");
const router = express.Router();

const { authenticate } = require("../../authentication/middlewares/authenticate");
const { authorize } = require("../../authentication/middlewares/authorize");
const financialTicketsController = require("../controllers/financial_tickets.controller");

// Lấy mã phiếu chi kế tiếp theo format PAY-DDMMYYYY-XXXX - chỉ dành cho kế toán
router.get(
  "/payments/next-voucher",
  authenticate,
  authorize("accountant"),
  financialTicketsController.getNextPaymentVoucherCode
);

// Tạo phiếu chi thủ công - chỉ dành cho kế toán
router.post(
  "/payments",
  authenticate,
  authorize("accountant"),
  financialTicketsController.createManualPaymentTicket
);

// Danh sách phiếu chi (Payment) - chỉ dành cho kế toán
router.get(
  "/payments",
  authenticate,
  authorize("accountant"),
  financialTicketsController.getPaymentTickets
);

// Cập nhật trạng thái phiếu chi (Payment) - chỉ dành cho kế toán
router.patch(
  "/:id/status",
  authenticate,
  authorize("accountant"),
  financialTicketsController.updatePaymentTicketStatus
);

module.exports = router;

