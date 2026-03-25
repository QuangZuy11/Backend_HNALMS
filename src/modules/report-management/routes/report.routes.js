// Báo cáo: doanh thu, hiệu suất, sửa chữa
const express = require("express");
const router = express.Router();
const reportController = require("../controllers/report.controller");

// Performance reports
router.get("/performance/vacancy", reportController.getVacancyReport);
router.get("/performance/snapshot", reportController.getSnapshot);

// Maintenance & Repair reports
router.get("/maintenance/by-month", reportController.getMaintenanceByMonth);
router.get("/maintenance/snapshot", reportController.getMaintenanceSnapshot);
router.get("/maintenance/peak", reportController.getPeakMonth);

module.exports = router;
