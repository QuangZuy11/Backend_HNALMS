const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema({
    user_id: {
        type: String,
        required: true,
        unique: true,
        index: true,
        default: () => new mongoose.Types.ObjectId().toString()
    },
    email: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'owner', 'tenant', 'accountant'], default: 'tenant' },
    isactive: { type: Boolean, default: true },
    create_at: { type: Date, default: Date.now }
}, { timestamps: false });

const User = mongoose.model("User", UserSchema, "user");

module.exports = User;
