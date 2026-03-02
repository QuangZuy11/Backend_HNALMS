// const mongoose = require("mongoose");

// const roomSchema = new mongoose.Schema(
//   {
//     roomCode: {
//       type: String,
//       required: true,
//       unique: true,
//     },
//     title: {
//       type: String,
//       required: true,
//     },
//     floor: {
//       type: Number,
//       required: true,
//     },
//     floorLabel: String,
//     status: {
//       type: String,
//       enum: ["Trống", "Đã thuê", "Bảo trì"],
//       default: "Trống",
//     },
//     description: String,
//     price: {
//       type: Number,
//       required: true,
//     },
//     priceLabel: String,
//     area: {
//       type: Number,
//       required: true,
//     },
//     capacity: {
//       type: Number,
//       default: 2,
//     },
//     bathrooms: {
//       type: Number,
//       default: 1,
//     },
//     amenities: [String],
//     images: [String],
//   },
//   {
//     timestamps: true,
//   },
// );

// module.exports = mongoose.model("Room", roomSchema);



const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // VD: P101
    },
    roomCode: {
      type: String,
      required: true,
      unique: true,
    },
    floorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Floor",
      required: true,
    },
    roomTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomType",
      required: true,
    },
    status: {
      type: String,
      enum: ["Available", "Occupied", "Deposited"],
      default: "Available",
    },
    description: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Room = mongoose.model("Room", roomSchema);
module.exports = Room;