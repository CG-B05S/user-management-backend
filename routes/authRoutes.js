const express = require("express");
const router = express.Router();
const { register, login, verifyOTP, resendVerificationOtp, getProfile, updatePassword, updateProfile, forgotPassword, resetPassword } = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOTP);
router.post("/resend-verification-otp", resendVerificationOtp);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/profile", auth, getProfile);
router.put("/update-password", auth, updatePassword);
router.put("/update-profile", auth, updateProfile);

module.exports = router;
