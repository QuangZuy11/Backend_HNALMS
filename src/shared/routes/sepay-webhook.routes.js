const express = require("express");
const router = express.Router();
const sepayWebhookController = require("../controllers/sepay-webhook.controller");

// Middleware xác thực Sepay API Key
const verifySepayToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const expectedToken = `Apikey ${process.env.SEPAY_WEBHOOK_TOKEN}`;

    console.log(`[SEPAY WEBHOOK] 🔐 Auth check - Received: "${authHeader}", Expected: "${expectedToken}"`);

    if (!authHeader || authHeader !== expectedToken) {
        console.warn("[SEPAY WEBHOOK] ❌ Unauthorized — invalid API key");
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    next();
};

// POST /api/webhook/sepay — Webhook chung cho tất cả giao dịch Sepay
router.post("/sepay", verifySepayToken, sepayWebhookController.handleWebhook);

// ⚠️ DEBUG ONLY - Test endpoint không cần auth
router.post("/sepay-test", async (req, res) => {
    console.log("[SEPAY TEST] 🔓 Test endpoint called (no auth required)");
    try {
        await sepayWebhookController.handleWebhook(req, res);
    } catch (err) {
        console.error("[SEPAY TEST] ❌ Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
