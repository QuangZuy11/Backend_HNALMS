/**
 * Model nội quy tòa nhà
 * Quản lý thông tin nội quy, quy định của tòa nhà
 */
const mongoose = require("mongoose");

const buildingRulesSchema = new mongoose.Schema(
  {
    categories: [
      {
        title: {
          type: String,
          required: true,
        },
        icon: {
          type: String,
          required: true,
          enum: [
            "Clock",
            "Home",
            "Shield",
            "Users",
            "Zap",
            "AlertCircle",
            "Truck",
          ],
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

const BuildingRules = mongoose.model(
  "BuildingRules",
  buildingRulesSchema,
  "policies",
);

module.exports = BuildingRules;
