const express = require("express");
const router = express.Router();
const liquidationController = require("../controllers/liquidation.controller");
const uploadContractImg = require("../middlewares/uploadContractImg");

// Upload ảnh bằng chứng lên Cloudinary
router.post(
  "/upload-images",
  uploadContractImg.array("images", 10),
  (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "Không có file được upload." });
      }
      const imageUrls = req.files.map((f) => f.path);
      res.status(200).json({ success: true, data: imageUrls });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Tạo thanh lý hợp đồng (main transaction)
router.post("/create", liquidationController.createLiquidation);

// Lấy tất cả liquidations
router.get("/", liquidationController.getAllLiquidations);

// Lấy liquidation theo contractId
router.get(
  "/contract/:contractId",
  liquidationController.getLiquidationByContract
);

// Lấy chi tiết 1 liquidation
router.get("/:id", liquidationController.getLiquidationById);

module.exports = router;
