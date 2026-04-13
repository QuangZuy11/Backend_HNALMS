/**
 * Script: Xóa 7 trường không cần thiết khỏi các bản ghi deposit trong database
 * Chạy: node cleanup-deposit-fields.js
 * Chỉ chạy 1 lần, sau đó xóa file này.
 */

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/hnalms";

const depositSchema = new mongoose.Schema({}, { strict: false });
const Deposit = mongoose.model("Deposits", depositSchema, "deposits");

async function cleanup() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Đã kết nối MongoDB");

    const result = await Deposit.updateMany(
      {}, // lọc tất cả deposit
      {
        $unset: {
          idCard: 1,
          dob: 1,
          address: 1,
          gender: 1,
          startDate: 1,
          duration: 1,
          prepayMonths: 1,
          coResidents: 1,
        },
      }
    );

    console.log(`✅ Đã xóa 7 trường khỏi ${result.modifiedCount} bản ghi deposit`);
    console.log("Các trường đã xóa: idCard, dob, address, gender, startDate, duration, prepayMonths, coResidents");

    await mongoose.disconnect();
    console.log("✅ Hoàn tất");
    process.exit(0);
  } catch (err) {
    console.error("❌ Lỗi:", err.message);
    process.exit(1);
  }
}

cleanup();
