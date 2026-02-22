const mongoose = require("mongoose");
const { Schema } = mongoose;

const ComplaintRequestSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: [
      "Tiếng ồn",
      "Vệ sinh",
      "An ninh",
      "Cơ sở vật chất",
      "Thái độ phục vụ",
      "Khác"
    ],
    required: true
  },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High"],
    required: true,
    default: "Low"
  },
  status: {
    type: String,
    enum: ["Pending", "Processing", "Done"],
    required: true,
    default: "Pending"
  },
  response: {
    type: String,
    default: null
  },
  responseBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  responseDate: {
    type: Date,
    default: null
  },
  createdDate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: false });

const ComplaintRequest = mongoose.model(
  "ComplaintRequest",
  ComplaintRequestSchema,
  "complaint_requests"
);

module.exports = ComplaintRequest;
  