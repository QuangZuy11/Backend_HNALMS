const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
    },
    floor: {
      type: Number,
      required: true,
    },
    floorLabel: String,
    status: {
      type: String,
      enum: ["Trống", "Đã thuê", "Bảo trì"],
      default: "Trống",
    },
    description: String,
    price: {
      type: Number,
      required: true,
    },
    priceLabel: String,
    area: {
      type: Number,
      required: true,
    },
    capacity: {
      type: Number,
      default: 2,
    },
    bathrooms: {
      type: Number,
      default: 1,
    },
    amenities: [String],
    images: [String],
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Room", roomSchema);
