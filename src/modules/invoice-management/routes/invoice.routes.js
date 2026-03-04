const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoice.controller");

router.get("/", invoiceController.getAll);
router.post("/generate-drafts", invoiceController.generateDrafts); // Tạo hàng loạt
router.put("/:id/release", invoiceController.release); // Phát hành
router.get("/tenant/:tenantId", invoiceController.getInvoicesByTenant); // Lấy hóa đơn theo tenant
router.get("/:id", invoiceController.getInvoiceById);

module.exports = router;