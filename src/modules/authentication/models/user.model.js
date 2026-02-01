const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema({
    username: { type: String, required: true, unique: true, index: true },
    phoneNumber: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'owner', 'Tenant', 'accountant'], default: 'Tenant' },
    status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

const User = mongoose.model("User", UserSchema, "user");

module.exports = User;
