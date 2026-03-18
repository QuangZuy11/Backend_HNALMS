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


// PUT /api/services/:id
  async updateService(req, res) {
    try {
      const updatedService = await ServiceService.updateService(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "Cập nhật dịch vụ thành công",
        data: updatedService
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  // DELETE /api/services/:id
  async deleteService(req, res) {
    try {
      await ServiceService.deleteService(req.params.id);
      res.status(200).json({ success: true, message: "Đã xóa dịch vụ" });
    } catch (error) {
      handleError(res, error);
    }
  }

  // GET /api/services/my-services  (tenant tự xem)
  async getMyBookedServices(req, res) {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Không tìm thấy thông tin người dùng" });
      }
      const { contractId } = req.query;
      const data = await ServiceService.getBookedServicesByTenant(tenantId, contractId || null);
      res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
      handleError(res, error);
    }
  }

  // GET /api/services/tenant/:tenantId  (manager xem dịch vụ của một tenant cụ thể)
  async getBookedServicesByTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const data = await ServiceService.getBookedServicesByTenant(tenantId);
      res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
      handleError(res, error);
    }
  }

  // GET /api/services/list  - Tenant xem toàn bộ dịch vụ với trạng thái book
  async getAllServicesForTenant(req, res) {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Không tìm thấy thông tin người dùng" });
      }
      const { contractId } = req.query;
      const data = await ServiceService.getAllServicesForTenant(tenantId, contractId || null);
      res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
      handleError(res, error);
    }
  }

  // POST /api/services/book  - Tenant đăng ký dịch vụ Extension
  async bookService(req, res) {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Không tìm thấy thông tin người dùng" });
      }
      const { serviceId, quantity, contractId } = req.body;
      if (!serviceId) {
        return res.status(400).json({ success: false, message: "serviceId là bắt buộc" });
      }
      const parsedQuantity = quantity !== undefined ? parseInt(quantity, 10) : 1;
      if (isNaN(parsedQuantity) || parsedQuantity < 1) {
        return res.status(400).json({ success: false, message: "Số lượng người (quantity) phải là số nguyên >= 1" });
      }
      const data = await ServiceService.bookServiceForTenant(tenantId, serviceId, parsedQuantity, contractId || null);
      res.status(201).json({ success: true, message: "Đăng ký dịch vụ thành công", data });
    } catch (error) {
      handleError(res, error);
    }
  }

  // DELETE /api/services/book/:serviceId  - Tenant huỷ đăng ký dịch vụ Extension
  async cancelBookedService(req, res) {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Không tìm thấy thông tin người dùng" });
      }
      const { serviceId } = req.params;
      const { contractId } = req.query;
      const result = await ServiceService.cancelBookedServiceForTenant(tenantId, serviceId, contractId || null);
      res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      handleError(res, error);
    }
  }
}
module.exports = new ServiceController();