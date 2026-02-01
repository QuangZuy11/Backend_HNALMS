const mongoose = require("mongoose");

const priceHistorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      default: "Giá niêm yết",
    },
    price: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'onModel', // Tham chiếu động
    },
    onModel: {
      type: String,
      required: true,
      enum: ['RoomType', 'Service', 'Utility'], // Các bảng có thể lưu giá
      default: 'RoomType'
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null, // null nghĩa là giá này đang áp dụng
    },
  },
  {
    timestamps: true,
  }
);

// Getter convert Decimal128 -> Number khi trả về JSON
priceHistorySchema.set("toJSON", {
  getters: true,
  transform: (doc, ret) => {
    if (ret.price) ret.price = parseFloat(ret.price.toString());
    delete ret.id;
    return ret;
  },
});

const PriceHistory = mongoose.model("PriceHistory", priceHistorySchema);
module.exports = PriceHistory;