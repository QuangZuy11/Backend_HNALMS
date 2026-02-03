const ServiceService = require("../services/service.service");

// Helper xử lý lỗi tập trung (Giống file RoomController)
const handleError = (res, error) => {
  console.error("🔴 Service Error:", error);
  const status = error.status || 500;
  const message = error.message || "Lỗi server nội bộ";
  res.status(status).json({ success: false, message });
};

class ServiceController {
  
  // GET /api/services
  async getServices(req, res) {
    try {
      const services = await ServiceService.getAllServices(req.query);
      res.status(200).json({
        success: true,
        count: services.length,
        data: services
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  // POST /api/services
  async createService(req, res) {
    try {
      const newService = await ServiceService.createService(req.body);
      res.status(201).json({
        success: true,
        message: "Tạo dịch vụ thành công",
        data: newService
      });
    } catch (error) {
      handleError(res, error);
    }
  }
}

module.exports = new ServiceController();