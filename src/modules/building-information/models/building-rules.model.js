/**
 * Model nội quy tòa nhà
 * Quản lý thông tin nội quy, quy định của tòa nhà
 */
const mongoose = require("mongoose");

const buildingRulesSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      default: "Nội Quy Tòa Nhà",
    },
    description: {
      type: String,
      required: true,
    },
    importantNotice: {
      title: {
        type: String,
        default: "Thông Báo Quan Trọng",
      },
      content: {
        type: String,
        required: true,
      },
    },
    categories: [
      {
        title: {
          type: String,
          required: true,
        },
        icon: {
          type: String,
          required: true,
          enum: ["Clock", "Home", "Shield", "Users", "Zap", "AlertCircle"],
        },
        rules: [
          {
            type: String,
            required: true,
          },
        ],
      },
    ],
    guidelines: [
      {
        title: {
          type: String,
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
      },
    ],
    contact: {
      phone: {
        type: String,
      },
      zalo: {
        type: String,
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

const BuildingRules = mongoose.model("BuildingRules", buildingRulesSchema);

module.exports = BuildingRules;
