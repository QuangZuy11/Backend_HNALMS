const mongoose = require("mongoose");
const { Schema } = mongoose;

const bookServiceSchema = new Schema(
  {
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contracts",
      required: true,
    },
    services: [
      {
        serviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Service",
          required: true,
        },
        quantity: { type: Number, default: 1 },
        startDate: { type: Date, required: true },
        endDate: { type: Date, default: null },
        _id: false,
      },
    ],
  },
  {
    timestamps: true,
  },
);

const BookService = mongoose.model(
  "BookServices",
  bookServiceSchema,
  "bookservices",
);
module.exports = BookService;
