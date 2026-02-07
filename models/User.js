const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    companyName: String,
    contactNumber: String,
    address: String,
    status: {
        type: String,
        enum: ["Select Status", "received", "not_received", "switch_off", "callback", "required", "not_required"],
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

// Create a compound unique index on contactNumber and createdBy (per user uniqueness)
userSchema.index({ contactNumber: 1, createdBy: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
