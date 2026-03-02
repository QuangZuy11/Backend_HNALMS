const meterReadingService = require("../services/meterreading.service");

class MeterReadingController {
  async enterReading(req, res) {
    try {
      const result = await meterReadingService.enterReading(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateReading(req, res) {
    try {
      const result = await meterReadingService.updateReading(req.params.id, req.body);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // [THÊM MỚI] Xử lý request lấy chỉ số cũ
  async getLatest(req, res) {
    try {
      const { roomId, utilityId } = req.query; // Lấy dữ liệu từ URL query
      
      if (!roomId || !utilityId) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin roomId hoặc utilityId" });
      }

      const latestData = await meterReadingService.getLatestReading(roomId, utilityId);
      
      // Nếu không tìm thấy (phòng mới chưa ghi điện nước bao giờ), vẫn trả về 200 nhưng data là null
      res.status(200).json({ success: true, data: latestData });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async deleteReading(req, res) {
    try {
      const { id } = req.params;
      await meterReadingService.deleteReading(id);
      
      res.status(200).json({ 
        success: true, 
        message: "Đã hoàn tác chỉ số và cập nhật lại hóa đơn thành công." 
      });
    } catch (error) {
      res.status(400).json({ 
        success: false, 
        message: error.message 
      });
    }
  }
}

  
module.exports = new MeterReadingController();