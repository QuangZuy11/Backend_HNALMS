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
        // quantity: only for quantity_based services (vehicle parking)
        // Omitted for fixed_monthly and per_person services
        quantity: { type: Number },
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
