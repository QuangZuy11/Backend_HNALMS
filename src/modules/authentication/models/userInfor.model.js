const mongoose = require('mongoose');
const User = require('./user.model');
const userInfoSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true // đảm bảo 1 User chỉ có 1 UserInfo
    },

    fullname: {
      type: String,
      trim: true
    },

    citizen_id: {
      type: String,
      trim: true
    },

    permanent_address: {
      type: String,
      trim: true
    },

    dob: {
      type: Date
    },

    gender: {
      type: String,
      enum: ['male', 'female', 'other']
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('UserInfo', userInfoSchema);
