const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
require("dotenv").config();

// Import models
const User = require("./src/modules/authentication/models/user.model");

const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";

async function debugToken() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/hoangnambuilding",
    );
    console.log("✅ Connected to MongoDB");

    // Get token from command line argument
    const token = process.argv[2];

    if (!token) {
      console.log("\n❌ No token provided!");
      console.log("Usage: node debug-token.js <your-token-here>");
      process.exit(1);
    }

    console.log("\n🔍 Token to debug:", token.substring(0, 50) + "...");

    // 1. Decode token without verification
    const decoded = jwt.decode(token);
    console.log("\n📋 Decoded token (without verification):", decoded);

    // 2. Verify token
    try {
      const verified = jwt.verify(token, JWT_SECRET);
      console.log("\n✅ Token is VALID");
      console.log("Verified payload:", verified);
    } catch (err) {
      console.log("\n❌ Token verification FAILED:", err.message);
      console.log("This could mean:");
      console.log("  - Token has expired");
      console.log("  - Token was signed with different secret");
      console.log("  - Token is malformed");
    }

    // 3. Search for user in database
    if (decoded && decoded.userId) {
      console.log("\n🔍 Searching for user with userId:", decoded.userId);

      // Strategy 1: Find by user_id field
      let user = await User.findOne({ user_id: decoded.userId }).select(
        "-password",
      );
      console.log(
        "Strategy 1 (user_id field):",
        user ? "FOUND ✅" : "NOT FOUND ❌",
      );

      if (user) {
        console.log("User details:", {
          _id: user._id,
          user_id: user.user_id,
          email: user.email,
          role: user.role,
          isactive: user.isactive,
        });
      } else {
        // Strategy 2: Find by _id field
        if (mongoose.Types.ObjectId.isValid(decoded.userId)) {
          user = await User.findById(decoded.userId).select("-password");
          console.log(
            "Strategy 2 (_id field):",
            user ? "FOUND ✅" : "NOT FOUND ❌",
          );

          if (user) {
            console.log("User details:", {
              _id: user._id,
              user_id: user.user_id,
              email: user.email,
              role: user.role,
              isactive: user.isactive,
            });
          }
        }
      }

      if (!user) {
        console.log("\n❌ USER NOT FOUND in database!");
        console.log("Listing all users to help debug:");
        const allUsers = await User.find({})
          .select("_id user_id email role")
          .limit(10);
        console.log("All users (limit 10):");
        allUsers.forEach((u, index) => {
          console.log(
            `  ${index + 1}. _id: ${u._id}, user_id: ${u.user_id}, email: ${u.email}, role: ${u.role}`,
          );
        });
      }
    }

    await mongoose.connection.close();
    console.log("\n✅ MongoDB connection closed");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    await mongoose.connection.close();
  }
}

debugToken();
