const Device = require("../models/devices.model");
const xlsx = require("xlsx");

class DeviceService {
  
  async createDevice(data) {
    if (data.price === undefined || data.price === null || Number(data.price) <= 0) {
      throw new Error("Giá thiết bị phải lớn hơn 0");
    }

    const nameTrim = data.name.trim();
    const existing = await Device.findOne({ name: { $regex: new RegExp(`^${nameTrim}$`, "i") } });
    if (existing) {
      throw new Error(`Thiết bị có tên "${nameTrim}" đã tồn tại trong hệ thống`);
    }

    data.unit = "Cái";
    const device = new Device(data);
    return await device.save();
  }

  async getAllDevices() {
    return await Device.find().sort({ createdAt: -1 });
  }

  async updateDevice(id, data) {
    if (data.price !== undefined && (data.price === null || Number(data.price) <= 0)) {
      throw new Error("Giá thiết bị phải lớn hơn 0");
    }

    if (data.name) {
      const nameTrim = data.name.trim();
      const existing = await Device.findOne({ 
        name: { $regex: new RegExp(`^${nameTrim}$`, "i") },
        _id: { $ne: id } 
      });
      if (existing) {
        throw new Error(`Tên thiết bị "${nameTrim}" đã được sử dụng bởi một thiết bị khác`);
      }
    }

    data.unit = "Cái";
    const device = await Device.findByIdAndUpdate(id, data, { new: true });
    if (!device) throw new Error("Không tìm thấy thiết bị");
    return device;
  }

  async deleteDevice(id) {
    const device = await Device.findByIdAndDelete(id);
    if (!device) throw new Error("Không tìm thấy thiết bị");
    return device;
  }

  async generateTemplateExcel() {
    const headers = [
      { header: "Tên thiết bị (*)", key: "name", width: 30 },
      { header: "Thương hiệu", key: "brand", width: 20 },
      { header: "Model", key: "model", width: 20 },
      { header: "Danh mục", key: "category", width: 20 },
      { header: "Giá tiền", key: "price", width: 15 },
      { header: "Mô tả", key: "description", width: 40 },
    ];

    const sampleData = [{
      name: "Máy giặt LG 9kg",
      brand: "LG",
      model: "FV1409S4W",
      category: "Điện gia dụng",
      price: 8500000,
      description: "Inverter, giặt hơi nước"
    }];

    const worksheet = xlsx.utils.json_to_sheet(sampleData);
    xlsx.utils.sheet_add_aoa(worksheet, [headers.map(h => h.header)], { origin: "A1" });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Mau_Nhap_Lieu");

    return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  }

  async importExcel(fileBuffer) {
    const workbook = xlsx.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    // 1. Kiểm tra file có dữ liệu không (ít nhất phải có 2 dòng: 1 header + 1 data)
    if (!jsonData || jsonData.length < 2) {
      throw new Error("File Excel không có dữ liệu để Import.");
    }

    // ==============================================================
    // [MỚI] 2. BỨC TƯỜNG LỬA: KIỂM TRA ĐÚNG FILE MẪU THIẾT BỊ KHÔNG
    // ==============================================================
    const headerRow = jsonData[0] || [];
    const firstColumnHeader = (headerRow[0] || "").toString().trim();
    
    // Nếu cột đầu tiên không chứa chữ "Tên thiết bị", chắc chắn là nhầm file!
    if (!firstColumnHeader.toLowerCase().includes("tên thiết bị")) {
      throw new Error("Sai định dạng file! Vui lòng tải đúng file mẫu của Quản lý Thiết bị.");
    }
    // ==============================================================

    const devicesToInsert = [];
    const errors = [];
    
    const allExistingDevices = await Device.find({}, "name");
    const existingNamesInDB = new Set(allExistingDevices.map(d => d.name.toLowerCase().trim()));
    const namesInCurrentExcel = new Set();

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      // Nếu dòng trống hoàn toàn thì bỏ qua
      if (!row || row.length === 0 || Object.keys(row).length === 0) continue;

      const rawName = (row[0] || "").toString().trim();
      const deviceData = {
        name: rawName,
        brand: row[1] || "",
        model: row[2] || "",
        category: row[3] || "",
        price: Number(row[4]) || 0,
        description: (row[5] || "").toString().slice(0, 100),
        unit: "Cái"
      };

      if (!deviceData.name) {
        errors.push(`Dòng ${i + 1}: Thiếu tên thiết bị`);
        continue;
      }

      const lowerName = deviceData.name.toLowerCase();

      if (existingNamesInDB.has(lowerName)) {
        errors.push(`Dòng ${i + 1}: Tên "${deviceData.name}" đã tồn tại trong hệ thống`);
        continue;
      }

      if (namesInCurrentExcel.has(lowerName)) {
        errors.push(`Dòng ${i + 1}: Tên "${deviceData.name}" bị lặp lại trong file Excel`);
        continue;
      }

      namesInCurrentExcel.add(lowerName);
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