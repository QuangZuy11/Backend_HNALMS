const express = require("express");
const router = express.Router();
const contractController = require("../controllers/contract.controller");
const uploadContractImg = require("../middlewares/uploadContractImg");
const { authenticate } = require("../../authentication/middlewares/authenticate");

// Route to upload contract images to Cloudinary
router.post("/upload-images", uploadContractImg.array("images", 5), contractController.uploadContractImages);

// Route to create a new contract
router.post("/create", contractController.createContract);

// Add other routes here (e.g., get list, get detail, etc.)

// Route to get all contracts
router.get("/", contractController.getAllContracts);
router.get("/my-contracts", authenticate, contractController.getMyContracts);
router.get("/:id", contractController.getContractById);

module.exports = router;
