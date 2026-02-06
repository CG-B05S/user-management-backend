const User = require("../models/User");
const XLSX = require("xlsx");

exports.createUser = async (req, res) => {
    try {
        const user = await User.create({
            ...req.body,
            createdBy: req.user.id
        });

        res.json(user);
    } catch {
        res.status(500).json({ message: "Create failed" });
    }
};

exports.bulkUploadUsers = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "No file uploaded"
            });
        }

        const workbook = XLSX.read(req.file.buffer, {
            type: "buffer"
        });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(sheet);

        const users = rows.map(row => ({
            companyName: row["Company Name"],
            contactNumber: row["Contact Number"],
            address: row["Address"],
            status: row["Status"] || "Select Status",
            followUpDateTime: row["Follow Up"]
                ? new Date(row["Follow Up"])
                : null,
            createdBy: req.user.id
        }));

        await User.insertMany(users);

        res.json({ message: "Users uploaded successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Bulk upload failed"
        });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const { search, status } = req.query;

        let query = {};

        // SEARCH
        if (search) {
            query.$or = [
                { companyName: { $regex: search, $options: "i" } },
                { contactNumber: { $regex: search, $options: "i" } },
                { address: { $regex: search, $options: "i" } }
            ];
        }

        // STATUS FILTER
        if (status) {
            query.status = status;
        }

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await User.countDocuments(query);

        res.json({
            users,
            total,
            page,
            pages: Math.ceil(total / limit)
        });

    } catch {
        res.status(500).json({ message: "Fetch failed" });
    }
};


exports.updateUser = async (req, res) => {
    try {

        // If follow-up time changed, reset reminder flag
        if (req.body.followUpDateTime) {
            req.body.followUpReminderSent = false;
        }

        await User.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.json({ message: "Updated" });

    } catch (err) {
        res.status(500).json({ message: "Update failed" });
    }
};


exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch {
        res.status(500).json({ message: "Delete failed" });
    }
};
