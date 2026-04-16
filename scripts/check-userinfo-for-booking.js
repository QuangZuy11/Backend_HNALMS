/**
 * Script debug: Kiểm tra UserInfo trong DB cho booking request cụ thể
 * Chạy: node scripts/check-userinfo-for-booking.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  const UserInfo = require("../src/modules/authentication/models/userInfor.model");
  const User = require("../src/modules/authentication/models/user.model");
  const Contract = require("../src/modules/contract-management/models/contract.model");

  // Thông tin từ booking request đang test
  const cccd = "025203004188";
  const phone = "0869048066";
  const email = "quangenguyene@gmail.com";

  console.log("=== Kiểm tra thông tin booking request ===");
  console.log(`CCCD:  "${cccd}"`);
  console.log(`Phone: "${phone}"`);
  console.log(`Email: "${email}"\n`);

  const normalizedEmail = email.trim().toLowerCase();

  const [byCCCD, byPhone, byEmail] = await Promise.all([
    UserInfo.findOne({ cccd: cccd.trim().replace(/\s/g, "") }),
    UserInfo.findOne({ phone: phone.trim() }),
    UserInfo.findOne({ email: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }),
  ]);

  console.log("--- Kết quả tìm kiếm trong UserInfos ---");
  console.log(`ByCCCD:  ${byCCCD ? `FOUND (id=${byCCCD._id}, userId=${byCCCD.userId})` : "NOT FOUND"}`);
  console.log(`ByPhone: ${byPhone ? `FOUND (id=${byPhone._id}, userId=${byPhone.userId})` : "NOT FOUND"}`);
  console.log(`ByEmail: ${byEmail ? `FOUND (id=${byEmail._id}, email_in_db="${byEmail.email}", userId=${byEmail.userId})` : "NOT FOUND"}`);

  if (byCCCD && byPhone && byEmail) {
    const allSame =
      byCCCD._id.equals(byPhone._id) &&
      byCCCD._id.equals(byEmail._id);
    console.log(`\nallThreeMatch: ${allSame ? "✅ TRUE → sẽ REUSE tài khoản cũ" : "❌ FALSE → sẽ tạo tài khoản MỚI"}`);

    if (!allSame) {
      console.log("\n⚠️  KHÁC nhau! Cùng 1 CCCD/phone/email nhưng trỏ đến UserInfo khác nhau:");
      if (!byCCCD._id.equals(byPhone._id)) console.log(`  - CCCD ID (${byCCCD._id}) ≠ Phone ID (${byPhone._id})`);
      if (!byCCCD._id.equals(byEmail._id)) console.log(`  - CCCD ID (${byCCCD._id}) ≠ Email ID (${byEmail._id})`);
    } else {
      const userInfoDoc = byCCCD;
      console.log(`\n=== UserInfo record ===`);
      console.log(JSON.stringify(userInfoDoc.toObject(), null, 2));

      const userDoc = await User.findById(userInfoDoc.userId);
      console.log(`\n=== User record ===`);
      console.log(userDoc ? JSON.stringify(userDoc.toObject(), null, 2) : "NOT FOUND (userId orphaned)");

      if (userDoc) {
        const contracts = await Contract.find({ tenantId: userDoc._id });
        console.log(`\n=== Contracts for this user (${contracts.length}) ===`);
        contracts.forEach(c => console.log(`  - contractId=${c._id}, status=${c.status}, roomId=${c.roomId}`));
      }
    }
  } else {
    console.log("\n⚠️  Ít nhất 1 field không tìm thấy → sẽ tạo tài khoản MỚI");
    if (!byCCCD) console.log("  - CCCD: NOT FOUND trong UserInfos");
    if (!byPhone) console.log("  - Phone: NOT FOUND trong UserInfos");
    if (!byEmail) console.log("  - Email: NOT FOUND trong UserInfos");
  }

  await mongoose.disconnect();
  console.log("\n✅ Done");
}

main().catch(e => { console.error("❌ Error:", e); process.exit(1); });
