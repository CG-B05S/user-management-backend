const express = require("express");
const router = express.Router();
const { register, login, verifyOTP, getProfile, updatePassword, updateProfile } = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOTP);
router.get("/profile", auth, getProfile);
router.put("/update-password", auth, updatePassword);
router.put("/update-profile", auth, updateProfile);

module.exports = router;
