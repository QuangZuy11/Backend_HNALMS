// Báo cáo: doanh thu, hiệu suất, sửa chữa
const express = require("express");
const router = express.Router();
const reportController = require("../controllers/report.controller");

// Performance reports
router.get("/performance/vacancy", reportController.getVacancyReport);
router.get("/performance/snapshot", reportController.getSnapshot);

module.exports = router;
