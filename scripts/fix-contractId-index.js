/**
 * Script fix: Xóa duplicate contractId null + xóa unique index trên MongoDB Atlas
 * Chạy: node scripts/fix-contractId-index.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

async function fixContractId() {
  try {
    console.log("🔌 Đang kết nối MongoDB Atlas...");
    console.log("   URI:", MONGO_URI.replace(/:[^:@]+@/, ":***@"));

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      family: 4,
    });
    console.log("✅ Đã kết nối");

    const db = mongoose.connection.db;
    const collection = db.collection("deposits");

    // === Bước 1: Xóa index contractId_unique_sparse ===
    console.log("\n📋 Đang kiểm tra indexes...");
    const indexes = await collection.indexes();

    let dropped = false;
    for (const idx of indexes) {
      if (idx.key && idx.key.contractId !== undefined) {
        console.log(`🗑️  Xóa index: "${idx.name}" (unique=${idx.unique}, sparse=${idx.sparse})`);
        try {
          await collection.dropIndex(idx.name);
          console.log(`✅ Đã xóa index "${idx.name}"`);
          dropped = true;
        } catch (dropErr) {
          console.error(`❌ Lỗi khi xóa index "${idx.name}":`, dropErr.message);
        }
      }
    }

    if (!dropped) {
      console.log("⚠️  Không tìm thấy index contractId để xóa");
    }

    // === Bước 2: Verify truy vấn deposits ===
    console.log("\n🔍 Đang kiểm tra deposits...");
    const count = await collection.countDocuments({ contractId: null });
    console.log(`📊 Số deposit có contractId = null: ${count}`);

    // === Bước 3: Tạo lại index đúng (sparse, không unique) ===
    console.log("\n📌 Tạo lại index cho contractId (sparse, không unique)...");
    try {
      await collection.createIndex(
        { contractId: 1 },
        { sparse: true, background: true }
      );
      console.log("✅ Đã tạo index sparse cho contractId");
    } catch (idxErr) {
      console.log("⚠️  Index có thể đã tồn tại:", idxErr.message);
    }

    // === Bước 4: Verify cuối cùng ===
    console.log("\n📋 Indexes cuối cùng:");
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((idx) => {
      if (idx.key && idx.key.contractId !== undefined) {
        console.log(`  ✅ contractId: unique=${idx.unique}, sparse=${idx.sparse}`);
      }
    });

    await mongoose.disconnect();
    console.log("\n✅ Hoàn tất! Restart backend server.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    if (error.message.includes("timed out")) {
      console.error("💡 Kiểm tra lại kết nối internet hoặc Atlas cluster");
    }
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixContractId();
