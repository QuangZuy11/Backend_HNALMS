/**
 * Script drop index contractId_unique_sparse trong MongoDB
 * Chạy: node drop-contractId-index.js
 */

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/HoangName_System";

async function dropContractIdIndex() {
  try {
    console.log("🔌 Đang kết nối MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Đã kết nối");

    const db = mongoose.connection.db;
    const collection = db.collection("deposits");

    console.log("📋 Đang lấy danh sách indexes...");
    const indexes = await collection.indexes();

    console.log("\n📊 Indexes hiện tại:");
    indexes.forEach((idx) => {
      console.log(`  - Name: "${idx.name}", Unique: ${idx.unique}, Sparse: ${idx.sparse}, Key: ${JSON.stringify(idx.key)}`);
    });

    // Tìm index có key là contractId
    const contractIdIndex = indexes.find(
      (idx) => idx.key && idx.key.contractId !== undefined
    );

    if (!contractIdIndex) {
      console.log("\n✅ Không có index contractId nào cần xóa.");
      process.exit(0);
    }

    console.log(`\n🗑️  Đang xóa index: "${contractIdIndex.name}"`);
    await collection.dropIndex(contractIdIndex.name);
    console.log(`✅ Đã xóa index "${contractIdIndex.name}" thành công!`);

    // Verify
    const remaining = await collection.indexes();
    console.log("\n📋 Indexes sau khi xóa:");
    remaining.forEach((idx) => {
      console.log(`  - "${idx.name}" | Key: ${JSON.stringify(idx.key)}`);
    });

    await mongoose.disconnect();
    console.log("\n✅ Hoàn tất!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

dropContractIdIndex();