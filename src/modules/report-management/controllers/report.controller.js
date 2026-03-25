// Báo cáo: doanh thu, hiệu suất, sửa chữa
const performanceReportService = require("../services/performance-report.service");
const maintenanceReportService = require("../services/maintenance-report.service");

/**
 * GET /api/reports/performance/vacancy
 * Query params: startMonth (YYYY-MM), endMonth (YYYY-MM)
 * Mặc định trả về 12 tháng gần nhất
 */
exports.getVacancyReport = async (req, res) => {
  try {
    const { startMonth, endMonth } = req.query;
    const data = await performanceReportService.getVacancyByMonth({
      startMonth,
      endMonth,
    });
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error getVacancyReport:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi khi lấy báo cáo phòng trống",
    });
  }
};

/**
 * GET /api/reports/performance/snapshot
 * Thống kê tổng quan cho một tháng cụ thể
 * Query param: month (YYYY-MM)
 */
exports.getSnapshot = async (req, res) => {
  try {
    const { month } = req.query;
    const data = await performanceReportService.getCurrentSnapshot(month);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error getSnapshot:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi khi lấy thống kê tổng quan",
    });
  }
};

/**
 * GET /api/reports/maintenance/by-month
 * Thống kê sửa chữa & bảo trì theo tháng
 * Query params: startMonth (YYYY-MM), endMonth (YYYY-MM)
 * Mặc định trả về 12 tháng gần nhất
 */
exports.getMaintenanceByMonth = async (req, res) => {
  try {
    const { startMonth, endMonth } = req.query;
    const data = await maintenanceReportService.getMaintenanceByMonth({
      startMonth,
      endMonth,
    });
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error getMaintenanceByMonth:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi khi lấy báo cáo sửa chữa theo tháng",
    });
  }
};

/**
 * GET /api/reports/maintenance/snapshot
 * Thống kê tổng quan sửa chữa & bảo trì cho tháng hiện tại
 * Query param: month (YYYY-MM)
 */
exports.getMaintenanceSnapshot = async (req, res) => {
  try {
    const { month } = req.query;
    const data = await maintenanceReportService.getSnapshotByMonth(month);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error getMaintenanceSnapshot:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi khi lấy thống kê tổng quan sửa chữa",
    });
  }
};

/**
 * GET /api/reports/maintenance/peak
 * Tìm tháng cao điểm sửa chữa & bảo trì
 * Query params: startMonth (YYYY-MM), endMonth (YYYY-MM)
 */
exports.getPeakMonth = async (req, res) => {
  try {
    const { startMonth, endMonth } = req.query;
    const data = await maintenanceReportService.getPeakMonth({
      startMonth,
      endMonth,
    });
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error getPeakMonth:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi khi tìm tháng cao điểm",
    });
  }
};
