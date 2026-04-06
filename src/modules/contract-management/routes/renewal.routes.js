const express = require("express");
const router = express.Router();
const renewalController = require("../controllers/renewal.controller");
const {
  authenticate,
} = require("../../authentication/middlewares/authenticate");

router.post("/send-notifications", renewalController.sendRenewalNotifications);

router.get(
  "/preview/:contractId",
  authenticate,
  renewalController.getRenewalPreview
);

router.post("/confirm", authenticate, renewalController.confirmRenewal);

router.post("/decline", authenticate, renewalController.declineRenewal);

module.exports = router;
