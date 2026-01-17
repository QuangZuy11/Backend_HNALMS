const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema({
    username: { type: String, required: true, unique: true },
    fullname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'seller', 'buyer'], default: 'buyer' },
    avatarURL: { type: String },
    action: { type: String, enum: ['lock', 'unlock'], default: 'unlock' }
}, { timestamps: true });

const User = mongoose.model("User", UserSchema, "user");

module.exports = User;
