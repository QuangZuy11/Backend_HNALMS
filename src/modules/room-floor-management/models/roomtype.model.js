const mongoose = require("mongoose");

const roomTypeSchema = new mongoose.Schema(
  {
    typeName: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    // Giá hiển thị hiện tại (để query nhanh)
    currentPrice: { 
      type: mongoose.Schema.Types.Decimal128, 
      required: true, 
      default: 0 
    },
    images: [{ type: String }],
    status: { 
      type: String, 
      enum: ["active", "inactive"], 
      default: "active" 
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true },
  }
);

// Virtual: Lấy danh sách lịch sử giá
roomTypeSchema.virtual("histories", {
  ref: "PriceHistory",
  localField: "_id",
  foreignField: "relatedId",
  match: { onModel: 'RoomType' } 
});

// Getter convert Decimal128 -> Number
roomTypeSchema.set("toJSON", {
  virtuals: true,
  getters: true,
  transform: (doc, ret) => {
    if (ret.currentPrice) ret.currentPrice = parseFloat(ret.currentPrice.toString());
    delete ret.id;
    return ret;
  },
});

const RoomType = mongoose.model("RoomType", roomTypeSchema);
module.exports = RoomType;