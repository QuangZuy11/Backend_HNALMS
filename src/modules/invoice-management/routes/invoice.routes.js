const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoice.controller");
const { authenticate } = require("../../authentication/middlewares");

router.get("/", invoiceController.getAll);
router.post("/generate-drafts", invoiceController.generateDrafts); // Tạo hàng loạt
router.put("/:id/release", invoiceController.release); // Phát hành
router.get("/tenant/:tenantId", invoiceController.getInvoicesByTenant); // Lấy hóa đơn theo tenant (admin)
router.get("/my/:id", authenticate, invoiceController.getMyInvoiceById); // Tenant xem chi tiết hóa đơn của mình
router.get("/:id", invoiceController.getInvoiceById);
router.put("/:id/pay", invoiceController.markAsPaid);

module.exports = router;