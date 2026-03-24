// Báo cáo: doanh thu, hiệu suất, sửa chữa
const performanceReportService = require("../services/performance-report.service");

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
