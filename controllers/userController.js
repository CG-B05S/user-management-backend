const User = require("../models/User");
const XLSX = require("xlsx");

exports.createUser = async (req, res) => {
    try {
        // Validate required fields
        if (!req.body.contactNumber || !req.body.contactNumber.trim()) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        // Validate phone number format (10 digits only)
        const phoneRegex = /^\d{10}$/;
        if (!phoneRegex.test(req.body.contactNumber.trim())) {
            return res.status(400).json({ error: "Phone number must be exactly 10 digits" });
        }

        const normalizeStatus = (status) => {
            if (!status) return "Select Status";
            const value = status.toLowerCase().trim();
            const map = {
                "received": "received",
                "not received": "not_received",
                "not_received": "not_received",
                "not recived": "not_received",
                "switch off": "switch_off",
                "switch_off": "switch_off",
                "callback": "callback",
                "required": "required",
                "not required": "not_required",
                "not_required": "not_required"
            };
            return map[value] || "Select Status";
        };

        // Check if phone number already exists for this user
        if (req.body.contactNumber) {
            const existingUser = await User.findOne({
                contactNumber: req.body.contactNumber,
                createdBy: req.user.id
            });
            
            if (existingUser) {
                return res.status(400).json({ 
                    message: "Duplicate phone number",
                    error: `Phone number ${req.body.contactNumber} already exists in your users` 
                });
            }
        }

        const normalizedNotes =
            typeof req.body.notes === "string" ? req.body.notes.trim() : "";

        const user = await User.create({
            ...req.body,
            notes: normalizedNotes,
            status: normalizeStatus(req.body.status),
            createdBy: req.user.id
        });

        res.json(user);
    } catch (err) {
        // Handle MongoDB duplicate key error
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return res.status(400).json({ 
                message: "Duplicate entry",
                error: `${field} already exists` 
            });
        }
        res.status(500).json({ message: "Create failed", error: err.message });
    }
};

exports.bulkUploadUsers = async (req, res) => {
  try {
    console.log("🔵 Bulk upload started");
    console.log("File:", req.file ? req.file.originalname : "No file");
    
    // Parse Excel file
    if (!req.file) {
      console.log("❌ No file received");
      return res.status(400).json({ message: "No file uploaded" });
    }

    console.log("📄 Parsing Excel file...");
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`✅ Parsed ${rows.length} rows from Excel`);

    const successUsers = [];
    const failedRows = [];
    const seenPhoneNumbers = new Set(); // Track duplicates within upload

    const normalizeStatus = (status) => {
      if (!status) return "Select Status";

      const value = status.toLowerCase().trim();

      const map = {
        "received": "received",
        "not received": "not_received",
        "not_received": "not_received",
        "not recived": "not_received",
        "switch off": "switch_off",
        "switch_off": "switch_off",
        "callback": "callback",
        "required": "required",
        "not required": "not_required",
        "not_required": "not_required"
      };

      return map[value] || "Select Status";
    };

    console.log("📝 Processing rows...");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        const userData = {
          companyName: row["COMPANY  NAME"]?.trim(),
          contactNumber: row["Contact No"]?.toString().trim(),
          address: row["Address"] || "",
          notes: (row["Notes"] || row["Note"] || "").toString().trim(),
          status: normalizeStatus(row["Status"]),
          createdBy: req.user.id
        };

        // basic validation
        if (!userData.contactNumber) {
          throw new Error("Phone number is required");
        }

        // Validate phone number format (10 digits only)
        const phoneRegex = /^\d{10}$/;
        if (!phoneRegex.test(userData.contactNumber)) {
          throw new Error("Phone number must be exactly 10 digits");
        }

        // Check for duplicate phone number within this upload
        if (userData.contactNumber) {
          if (seenPhoneNumbers.has(userData.contactNumber)) {
            throw new Error(`Duplicate phone number in this upload: ${userData.contactNumber}`);
          }
          
          // Check if phone number already exists for this user
          const existingUser = await User.findOne({
            contactNumber: userData.contactNumber,
            createdBy: req.user.id
          });
          
          if (existingUser) {
            throw new Error(`Phone number already exists: ${userData.contactNumber}`);
          }
          
          seenPhoneNumbers.add(userData.contactNumber);
        }

        await User.create(userData);
        successUsers.push(userData);
        console.log(`✓ Row ${i + 1} created`);

      } catch (err) {
        console.log(`✗ Row ${i + 1} failed: ${err.message}`);
        failedRows.push({
          rowNumber: i + 2, // Excel row number
          reason: err.message,
          data: row
        });
      }
    }

    console.log(`✅ Bulk upload completed: ${successUsers.length} success, ${failedRows.length} failed`);
    
    const response = {
      message: "Bulk upload completed",
      successCount: successUsers.length,
      failedCount: failedRows.length,
      failedRows
    };
    
    console.log("📤 Sending response:", response);
    res.json(response);
    console.log("✅ Response sent");

  } catch (err) {
    console.error("❌ Bulk upload error:", err);
    res.status(500).json({
      message: "Bulk upload failed",
      error: err.message
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

        // CRITICAL: Only show users created by the logged-in user
        query.createdBy = req.user.id;

        // SEARCH
        if (search) {
            query.$or = [
                { companyName: { $regex: search, $options: "i" } },
                { contactNumber: { $regex: search, $options: "i" } },
                { address: { $regex: search, $options: "i" } },
                { notes: { $regex: search, $options: "i" } }
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
        // CRITICAL: Verify user can only update their own created users
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        if (user.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: You can only update users you created" });
        }

        const normalizeStatus = (status) => {
            if (!status) return undefined;
            const value = status.toLowerCase().trim();
            const map = {
                "received": "received",
                "not received": "not_received",
                "not_received": "not_received",
                "not recived": "not_received",
                "switch off": "switch_off",
                "switch_off": "switch_off",
                "callback": "callback",
                "required": "required",
                "not required": "not_required",
                "not_required": "not_required"
            };
            return map[value] || undefined;
        };

        // If follow-up time changed, reset reminder flag
        if (req.body.followUpDateTime) {
            req.body.followUpReminderSent = false;
        }

        // Normalize status if provided
        if (req.body.status) {
            req.body.status = normalizeStatus(req.body.status);
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
            req.body.notes = typeof req.body.notes === "string" ? req.body.notes.trim() : "";
        }

        await User.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.json({ message: "Updated" });

    } catch (err) {
        res.status(500).json({ message: "Update failed", error: err.message });
    }
};


exports.deleteUser = async (req, res) => {
    try {
        // CRITICAL: Verify user can only delete their own created users
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        if (user.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ message: "Unauthorized: You can only delete users you created" });
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ message: "Delete failed", error: err.message });
    }
};
