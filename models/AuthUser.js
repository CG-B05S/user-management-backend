const mongoose = require("mongoose");

const authUserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  isVerified: { type: Boolean, default: false },
  otp: String,
  otpExpiresAt: Date,
  otpAttempts: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("AuthUser", authUserSchema);
