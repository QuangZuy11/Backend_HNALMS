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
}

module.exports = new MeterReadingController();