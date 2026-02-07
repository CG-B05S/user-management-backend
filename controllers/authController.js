const AuthUser = require("../models/AuthUser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendMail = require("../utils/sendMail");
const axios = require("axios");

// Password strength validation
const validatePasswordStrength = (password) => {
    const regex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])(?=.{8,})/;
    return regex.test(password);
};

exports.register = async (req, res) => {
    try {
        const { name, email, password, recaptchaToken } = req.body;

        // Validate password strength
        if (!validatePasswordStrength(password)) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters, 1 uppercase letter, 1 lowercase letter, and 1 special character"
            });
        }

        // Verify reCAPTCHA if secret key is configured
        if (process.env.RECAPTCHA_SECRET_KEY && recaptchaToken) {
            try {
                const response = await axios.post(
                    `https://www.google.com/recaptcha/api/siteverify`,
                    null,
                    {
                        params: {
                            secret: process.env.RECAPTCHA_SECRET_KEY,
                            response: recaptchaToken
                        }
                    }
                );

                // For reCAPTCHA v3: check score (threshold 0.5)
                if (!response.data.success) {
                    return res.status(400).json({ message: "reCAPTCHA verification failed" });
                }

                if (response.data.score && response.data.score < 0.5) {
                    return res.status(400).json({ message: "reCAPTCHA verification failed - possible bot activity" });
                }
            } catch (err) {
                console.error("reCAPTCHA verification error:", err);
                return res.status(400).json({ message: "reCAPTCHA verification failed" });
            }
        }

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

        // Validate password strength
        if (!validatePasswordStrength(newPassword)) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters, 1 uppercase letter, 1 lowercase letter, and 1 special character"
            });
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

exports.forgotPassword = async (req, res) => {
    try {
        const { email, recaptchaToken } = req.body;

        // Verify reCAPTCHA if secret key is configured
        if (process.env.RECAPTCHA_SECRET_KEY && recaptchaToken) {
            try {
                const response = await axios.post(
                    `https://www.google.com/recaptcha/api/siteverify`,
                    null,
                    {
                        params: {
                            secret: process.env.RECAPTCHA_SECRET_KEY,
                            response: recaptchaToken
                        }
                    }
                );

                if (!response.data.success) {
                    return res.status(400).json({ message: "reCAPTCHA verification failed" });
                }

                if (response.data.score && response.data.score < 0.5) {
                    return res.status(400).json({ message: "reCAPTCHA verification failed - possible bot activity" });
                }
            } catch (err) {
                console.error("reCAPTCHA verification error:", err);
                return res.status(400).json({ message: "reCAPTCHA verification failed" });
            }
        }

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await AuthUser.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 30 * 60 * 1000);

        // Save OTP to user
        user.otp = otp;
        user.otpExpiresAt = otpExpiry;
        user.otpAttempts = 0;
        await user.save();

        // Send OTP via email
        await sendMail({
            to: email,
            subject: "Reset Your Password",
            html: `
    <div style="font-family:Arial;padding:20px">
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password. Use the OTP below:</p>
      <h1 style="letter-spacing:5px">${otp}</h1>
      <p>This OTP is valid for 30 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    </div>
  `
        });

        res.json({ message: "OTP sent to your email" });
    } catch (err) {
        res.status(500).json({ message: "Failed to send OTP", error: err.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword, confirmPassword, recaptchaToken } = req.body;

        // Verify reCAPTCHA if secret key is configured
        if (process.env.RECAPTCHA_SECRET_KEY && recaptchaToken) {
            try {
                const response = await axios.post(
                    `https://www.google.com/recaptcha/api/siteverify`,
                    null,
                    {
                        params: {
                            secret: process.env.RECAPTCHA_SECRET_KEY,
                            response: recaptchaToken
                        }
                    }
                );

                if (!response.data.success) {
                    return res.status(400).json({ message: "reCAPTCHA verification failed" });
                }

                if (response.data.score && response.data.score < 0.5) {
                    return res.status(400).json({ message: "reCAPTCHA verification failed - possible bot activity" });
                }
            } catch (err) {
                console.error("reCAPTCHA verification error:", err);
                return res.status(400).json({ message: "reCAPTCHA verification failed" });
            }
        }

        if (!email || !otp || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        // Validate password strength
        if (!validatePasswordStrength(newPassword)) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters, 1 uppercase letter, 1 lowercase letter, and 1 special character"
            });
        }

        const user = await AuthUser.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        // Check OTP attempts
        if (user.otpAttempts >= 5) {
            return res.status(400).json({ message: "Too many attempts. Request new OTP." });
        }

        // Check if OTP is expired
        if (!user.otpExpiresAt || new Date() > user.otpExpiresAt) {
            return res.status(400).json({ message: "OTP has expired. Request a new one." });
        }

        // Verify OTP
        if (user.otp !== otp) {
            user.otpAttempts += 1;
            await user.save();
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // Check if new password is same as current password
        const isSame = await bcrypt.compare(newPassword, user.password);
        if (isSame) {
            return res.status(400).json({ message: "New password must be different from current password" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear OTP
        user.password = hashedPassword;
        user.otp = null;
        user.otpExpiresAt = null;
        user.otpAttempts = 0;
        await user.save();

        res.json({ message: "Password reset successfully. Please login with your new password." });
    } catch (err) {
        res.status(500).json({ message: "Password reset failed", error: err.message });
    }
};
