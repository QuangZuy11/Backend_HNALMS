const express = require("express");
const router = express.Router();
const contractController = require("../controllers/contract.controller");
const uploadContractImg = require("../middlewares/uploadContractImg");
const {
  authenticate,
} = require("../../authentication/middlewares/authenticate");

// Route test: Gửi thông báo gia hạn hợp đồng thủ công
router.post("/renewal/send-notifications", contractController.sendRenewalNotifications);

// Route to upload contract images to Cloudinary
router.post(
  "/upload-images",
  uploadContractImg.array("images", 5),
  contractController.uploadContractImages,
);

// Route to create a new contract
router.post("/create", contractController.createContract);

// Add other routes here (e.g., get list, get detail, etc.)

// Route to get all contracts
router.get("/", contractController.getAllContracts);
router.get("/my-contracts", authenticate, contractController.getMyContracts);
router.get(
  "/renewal/preview/:contractId",
  authenticate,
  contractController.getRenewalPreview
);
router.post("/renewal/confirm", authenticate, contractController.confirmRenewal);
router.post("/renewal/decline", authenticate, contractController.declineRenewal);
router.get("/:id", contractController.getContractById);
router.put("/:id", contractController.updateContract);

module.exports = router;
