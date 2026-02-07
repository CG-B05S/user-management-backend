const AuthUser = require("../models/AuthUser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendMail = require("../utils/sendMail");

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existing = await AuthUser.findOne({ email });
        if (existing && existing.isVerified)
            return res.status(400).json({ message: "User already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const otpExpiry = new Date(Date.now() + 30 * 60 * 1000);

        const user = await AuthUser.findOneAndUpdate(
            { email },
            {
                name,
                password: hashedPassword,
                otp,
                otpExpiresAt: otpExpiry,
                isVerified: false
            },
            { upsert: true, new: true }
        );

        await sendMail({
            to: email,
            subject: "Verify your email",
            html: `
    <div style="font-family:Arial;padding:20px">
      <h2>Email Verification</h2>
      <p>Your OTP is:</p>
      <h1 style="letter-spacing:5px">${otp}</h1>
      <p>This OTP is valid for 30 minutes.</p>
    </div>
  `
        });

        res.json({ message: "OTP sent to email" });

    } catch (err) {
        res.status(500).json({ message: "Registration failed" });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                message: "Email and OTP are required"
            });
        }

        const user = await AuthUser.findOne({ email });

        if (!user)
            return res.status(400).json({
                message: "User not found"
            });

        // STEP 1 — Block brute force attempts
        if (user.otpAttempts >= 5)
            return res.status(400).json({
                message: "Too many attempts. Request new OTP."
            });

        // STEP 2 — Check OTP
        if (user.otp !== otp) {
            user.otpAttempts += 1;
            await user.save();

            return res.status(400).json({
                message: "Invalid OTP"
            });
        }

        // STEP 3 — Check expiry
        if (new Date() > user.otpExpiresAt)
            return res.status(400).json({
                message: "OTP expired"
            });

        // STEP 4 — SUCCESS
        user.isVerified = true;
        user.otp = null;
        user.otpExpiresAt = null;
        user.otpAttempts = 0;

        await user.save();

        res.json({
            message: "Verified successfully"
        });

    } catch (error) {
        console.error("OTP Verification Error:", error);

        res.status(500).json({
            message: "Server error. Please try again later."
        });
    }
};



exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await AuthUser.findOne({ email });
        if (!user)
            return res.status(400).json({ message: "Invalid credentials" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(400).json({ message: "Invalid credentials" });

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({
            token,
            user: { id: user._id, name: user.name, email: user.email, profilePhoto: user.profilePhoto }
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await AuthUser.findById(req.user.id).select("-password");
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                profilePhoto: user.profilePhoto
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Current password and new password are required" });
        }

        const user = await AuthUser.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        // Check if new password is same as current
        const isSame = await bcrypt.compare(newPassword, user.password);
        if (isSame) {
            return res.status(400).json({ message: "New password must be different from current password" });
        }

        // Hash new password and update
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        res.json({ message: "Password updated successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { name, profilePhoto } = req.body;

        const user = await AuthUser.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (name) user.name = name;
        if (profilePhoto) user.profilePhoto = profilePhoto;

        await user.save();

        res.json({
            message: "Profile updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                profilePhoto: user.profilePhoto
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};
