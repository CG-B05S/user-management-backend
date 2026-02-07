const mongoose = require("mongoose");

const authUserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  profilePhoto: { type: String, default: null }, // URL or base64
  isVerified: { type: Boolean, default: false },
  otp: String,
  otpExpiresAt: Date,
  otpAttempts: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("AuthUser", authUserSchema);
