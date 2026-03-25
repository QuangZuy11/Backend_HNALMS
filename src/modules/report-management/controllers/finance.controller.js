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
  // 2. API: Lấy dữ liệu Báo cáo Doanh thu chi tiết (MỚI THÊM)
  async getCashflowReport(req, res) {
    try {
      const { startDate, endDate } = req.query;

      // Kiểm tra xem Frontend có gửi đủ ngày tháng không
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng cung cấp đầy đủ từ ngày (startDate) và đến ngày (endDate)."
        });
      }

      const reportData = await FinanceService.getCashflowReport(startDate, endDate);

      return res.status(200).json({
        success: true,
        message: "Lấy báo cáo dòng tiền thành công",
        data: reportData
      });
    } catch (error) {
      console.error("Lỗi getCashflowReport:", error);
      return res.status(500).json({
        success: false,
        message: "Có lỗi xảy ra khi trích xuất báo cáo dòng tiền.",
        error: error.message
      });
    }
  }

  async getRevenueReport(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const reportData = await FinanceService.getRevenueReport(startDate, endDate);
      return res.status(200).json({ success: true, data: reportData });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new FinanceController();