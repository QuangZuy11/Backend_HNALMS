/**
 * Migration: Drop unique indexes on phoneNumber (user) and cccd (userinfos)
 *
 * These unique constraints caused E11000 duplicate key errors when creating
 * contracts for tenants who share the same phone number or CCCD.
 *
 * Run this script once: node src/database/migrations/drop-unique-phone-cccd.js
 */
const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/HoangName_System";

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;

    // 1. Drop phoneNumber_1 unique index on user collection
    try {
      await db.collection("user").dropIndex("phoneNumber_1");
      console.log(
        "✅ Dropped unique index 'phoneNumber_1' on 'user' collection",
      );
    } catch (err) {
      if (err.codeName === "IndexNotFound") {
        console.log("ℹ️  Index 'phoneNumber_1' not found on 'user' — skipping");
      } else {
        console.error("❌ Error dropping phoneNumber_1:", err.message);
      }
    }

    // 2. Drop cccd_1 unique index on userinfos collection
    try {
      await db.collection("userinfos").dropIndex("cccd_1");
      console.log("✅ Dropped unique index 'cccd_1' on 'userinfos' collection");
    } catch (err) {
      if (err.codeName === "IndexNotFound") {
        console.log("ℹ️  Index 'cccd_1' not found on 'userinfos' — skipping");
      } else {
        console.error("❌ Error dropping cccd_1:", err.message);
      }
    }

    console.log("\nMigration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
