const express = require("express");
const router = express.Router();
const meterReadingController = require("../controllers/meterreading.controller");

router.get("/latest", meterReadingController.getLatest);

// Enter Meter Readings
router.post("/", meterReadingController.enterReading);

// Update Meter Reading
router.put("/:id", meterReadingController.updateReading);

module.exports = router;