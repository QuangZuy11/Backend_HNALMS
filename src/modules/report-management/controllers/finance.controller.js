const FinanceService = require("../services/finance.service");

class FinanceController {
  async getDashboard(req, res) {
    try {
      const { month, year } = req.query;
      
      const dashboardData = await FinanceService.getDashboardData(month, year);

      return res.status(200).json({
        success: true,
        message: "Lấy dữ liệu Dashboard Tài chính thành công",
        data: dashboardData
      });
    } catch (error) {
      console.error("Lỗi getDashboard:", error);
      return res.status(500).json({
        success: false,
        message: "Có lỗi xảy ra khi lấy dữ liệu tài chính.",
        error: error.message
      });
    }
  }
}

module.exports = new FinanceController();