const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema({
    username: { type: String, required: true, unique: true },
    fullname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'owner', 'tenant', 'accountant'], default: 'tenant' },
    avatarURL: { type: String },
    status: { type: String, enum: ['active', 'inactive', 'locked'], default: 'active' }
}, { timestamps: true });

const User = mongoose.model("User", UserSchema, "user");

module.exports = User;
