const floorService = require("../services/floor.service");

class FloorController {
  // Lấy danh sách tầng
  async getFloors(req, res) {
    try {
      const floors = await floorService.getAllFloors();
      res.json({
        success: true,
        total: floors.length,
        data: floors,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { status: 500, message: error.message },
      });
    }
  }

  // Lấy 1 tầng
  async getFloorById(req, res) {
    try {
      const floor = await floorService.getFloorById(req.params.id);
      if (!floor) {
        return res.status(404).json({
          success: false,
          error: { status: 404, message: "Floor not found" },
        });
      }
      res.json({ success: true, data: floor });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { status: 500, message: error.message },
      });
    }
  }

  // Tạo mới tầng
  async createFloor(req, res) {
    try {
      // req.body chứa { name, description, status }
      const newFloor = await floorService.createFloor(req.body);
      res.status(201).json({
        success: true,
        message: "Floor created successfully",
        data: newFloor,
      });
    } catch (error) {
      // Xử lý lỗi trùng tên (E11000 duplicate key error collection)
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          error: { status: 400, message: "Tên tầng đã tồn tại" },
        });
      }
      res.status(500).json({
        success: false,
        error: { status: 500, message: error.message },
      });
    }
  }

  // Cập nhật tầng
  async updateFloor(req, res) {
    try {
      const updatedFloor = await floorService.updateFloor(req.params.id, req.body);
      
      if (!updatedFloor) {
        return res.status(404).json({
          success: false,
          error: { status: 404, message: "Floor not found" },
        });
      }

      res.json({
        success: true,
        message: "Floor updated successfully",
        data: updatedFloor,
      });
    } catch (error) {
      // Xử lý lỗi trùng tên khi update
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          error: { status: 400, message: "Tên tầng đã tồn tại" },
        });
      }
      res.status(500).json({
        success: false,
        error: { status: 500, message: error.message },
      });
    }
  }

  // Xóa tầng
  async deleteFloor(req, res) {
    try {
      const deletedFloor = await floorService.deleteFloor(req.params.id);
      
      if (!deletedFloor) {
        return res.status(404).json({
          success: false,
          error: { status: 404, message: "Floor not found" },
        });
      }

      res.json({
        success: true,
        message: "Floor deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { status: 500, message: error.message },
      });
    }
  }
}

module.exports = new FloorController();