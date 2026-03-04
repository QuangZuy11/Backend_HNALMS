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

// Lấy mã phiếu thu kế tiếp theo format RC-DDMMYYYY-XXXX - chỉ dành cho kế toán
router.get(
  "/receipts/next-voucher",
  authenticate,
  authorize("accountant"),
  financialTicketsController.getNextReceiptVoucherCode
);

// Tạo phiếu chi thủ công - chỉ dành cho kế toán
router.post(
  "/payments",
  authenticate,
  authorize("accountant"),
  financialTicketsController.createManualPaymentTicket
);

// Tạo phiếu thu thủ công - chỉ dành cho kế toán
router.post(
  "/receipts",
  authenticate,
  authorize("accountant"),
  financialTicketsController.createManualReceiptTicket
);

// Danh sách phiếu chi (Payment) - chỉ dành cho kế toán
router.get(
  "/payments",
  authenticate,
  authorize("accountant"),
  financialTicketsController.getPaymentTickets
);

// Danh sách phiếu thu (Receipt) - chỉ dành cho kế toán
router.get(
  "/receipts",
  authenticate,
  authorize("accountant"),
  financialTicketsController.getReceiptTickets
);

// Cập nhật trạng thái phiếu chi (Payment) - chỉ dành cho kế toán
router.patch(
  "/:id/status",
  authenticate,
  authorize("accountant"),
  financialTicketsController.updatePaymentTicketStatus
);

module.exports = router;

