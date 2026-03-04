const mongoose = require("mongoose");
const User = require("./user.model");
const userInfoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // đảm bảo 1 User chỉ có 1 UserInfo
    },

    fullname: {
      type: String,
      trim: true,
    },

    cccd: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    dob: {
      type: Date,
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },
  },
  {
    timestamps: true,
    autoIndex: false, // Prevent Mongoose from auto-creating indexes (manage manually)
  },
);

module.exports = mongoose.model("UserInfo", userInfoSchema);
