const Device = require("../models/devices.model");
const xlsx = require("xlsx");

class DeviceService {
  
  async createDevice(data) {
    const device = new Device(data);
    return await device.save();
  }

  async getAllDevices() {
    return await Device.find().sort({ createdAt: -1 });
  }

  async updateDevice(id, data) {
    const device = await Device.findByIdAndUpdate(id, data, { new: true });
    if (!device) throw new Error("Không tìm thấy thiết bị");
    return device;
  }

  async deleteDevice(id) {
    const device = await Device.findByIdAndDelete(id);
    if (!device) throw new Error("Không tìm thấy thiết bị");
    return device;
  }

  // Tạo file mẫu
  async generateTemplateExcel() {
    const headers = [
      { header: "Tên thiết bị (*)", key: "name", width: 30 },
      { header: "Thương hiệu", key: "brand", width: 20 },
      { header: "Model", key: "model", width: 20 },
      { header: "Danh mục", key: "category", width: 20 },
      { header: "Đơn vị tính", key: "unit", width: 10 },
      { header: "Giá tiền", key: "price", width: 15 },
      { header: "Mô tả", key: "description", width: 40 },
    ];

    const sampleData = [{
      name: "Máy giặt LG 9kg",
      brand: "LG",
      model: "FV1409S4W",
      category: "Điện gia dụng",
      unit: "Cái",
      price: 8500000,
      description: "Inverter, giặt hơi nước"
    }];

    const worksheet = xlsx.utils.json_to_sheet(sampleData);
    xlsx.utils.sheet_add_aoa(worksheet, [headers.map(h => h.header)], { origin: "A1" });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Mau_Nhap_Lieu");

    return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  }

  // Import Excel
  async importExcel(fileBuffer) {
    const workbook = xlsx.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    const devicesToInsert = [];
    const errors = [];

    // Bắt đầu từ dòng index 1 (dòng 2 trong excel) vì dòng 0 là Header
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;

      const deviceData = {
        name: row[0],
        brand: row[1] || "",
        model: row[2] || "",
        category: row[3] || "",
        unit: row[4] || "Cái",
        price: row[5] || 0,
        description: row[6] || ""
      };

      if (!deviceData.name) {
        errors.push(`Dòng ${i + 1}: Thiếu tên thiết bị`);
        continue;
      }

      devicesToInsert.push(deviceData);
    }

    if (devicesToInsert.length > 0) {
      await Device.insertMany(devicesToInsert);
    }

    return {
      successCount: devicesToInsert.length,
      errorCount: errors.length,
      errors: errors
    };
  }
}

module.exports = new DeviceService();