const express = require("express");
const router = express.Router();
const sepayWebhookController = require("../controllers/sepay-webhook.controller");

// Middleware xác thực Sepay API Key
const verifySepayToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const expectedToken = `Apikey ${process.env.SEPAY_WEBHOOK_TOKEN}`;

    if (!authHeader || authHeader !== expectedToken) {
        console.warn("[SEPAY WEBHOOK] ❌ Unauthorized — invalid API key. Received:", authHeader);
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    next();
};

// POST /api/webhook/sepay — Webhook chung cho tất cả giao dịch Sepay
router.post("/sepay", verifySepayToken, sepayWebhookController.handleWebhook);

module.exports = router;
