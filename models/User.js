const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    contactNumber: String,
    address: String,
    status: {
        type: String,
        enum: ["Select Status", "received", "not_received", "switch_off", "callback"],
        default: "Select Status"
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AuthUser"
    },
    followUpDateTime: Date,
    followUpReminderSent: {
        type: Boolean,
        default: false
    }

}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
