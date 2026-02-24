const MeterReading = require("../models/meterreading.model");

class MeterReadingService {
  // Enter Meter Readings (Nhập chỉ số mới)
  async enterReading(data) {
    // Tự động tính toán lượng sử dụng (usageAmount)
    const usageAmount = data.newIndex - data.oldIndex;
    if (usageAmount < 0) {
      throw new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ");
    }

    const newReading = new MeterReading({
      ...data,
      usageAmount: usageAmount
    });

    return await newReading.save();
  }

  // Update Meter Reading (Cập nhật chỉ số)
  async updateReading(id, data) {
    const reading = await MeterReading.findById(id);
    if (!reading) throw new Error("Không tìm thấy bản ghi chỉ số");

    // Nếu có cập nhật chỉ số, tính lại usageAmount
    const oldIndex = data.oldIndex !== undefined ? data.oldIndex : reading.oldIndex;
    const newIndex = data.newIndex !== undefined ? data.newIndex : reading.newIndex;
    
    const usageAmount = newIndex - oldIndex;
    if (usageAmount < 0) {
      throw new Error("Chỉ số mới không được nhỏ hơn chỉ số cũ");
    }

    Object.assign(reading, data, { usageAmount });
    return await reading.save();
  }
}

module.exports = new MeterReadingService();