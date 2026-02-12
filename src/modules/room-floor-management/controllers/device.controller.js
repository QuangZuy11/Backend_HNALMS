const deviceService = require("../services/device.service");

class DeviceController {
  
  // [POST] /api/devices
  async create(req, res) {
    try {
      const device = await deviceService.createDevice(req.body);
      res.status(201).json({ success: true, data: device });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // [GET] /api/devices
  async getAll(req, res) {
    try {
      const devices = await deviceService.getAllDevices();
      res.status(200).json({ success: true, data: devices });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // [PUT] /api/devices/:id
  async update(req, res) {
    try {
      const device = await deviceService.updateDevice(req.params.id, req.body);
      res.status(200).json({ success: true, data: device });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // [DELETE] /api/devices/:id
  async delete(req, res) {
    try {
      await deviceService.deleteDevice(req.params.id);
      res.status(200).json({ success: true, message: "Xóa thiết bị thành công" });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // [GET] /api/devices/template
  async downloadTemplate(req, res) {
    try {
      const buffer = await deviceService.generateTemplateExcel();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=Device_Import_Template.xlsx"
      );
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // [POST] /api/devices/import
  async importExcel(req, res) {
    try {
      // Middleware uploadExcel đã xử lý file, nếu vào được đây tức là có file
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Vui lòng chọn file!" });
      }

      const result = await deviceService.importExcel(req.file.buffer);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new DeviceController();