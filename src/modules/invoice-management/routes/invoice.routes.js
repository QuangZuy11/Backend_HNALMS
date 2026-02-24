const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoice.controller");

router.get("/", invoiceController.getAll);
router.post("/generate-drafts", invoiceController.generateDrafts); // Tạo hàng loạt
router.put("/:id/release", invoiceController.release); // Phát hành

module.exports = router;