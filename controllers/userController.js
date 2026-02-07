const User = require("../models/User");
const XLSX = require("xlsx");

const normalizeHeader = (header = "") =>
  String(header)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getValueByAliases = (row, aliases, fuzzyMatchers = []) => {
  const normalizedRow = {};
  Object.keys(row || {}).forEach((key) => {
    normalizedRow[normalizeHeader(key)] = row[key];
  });

  for (const alias of aliases) {
    const value = normalizedRow[normalizeHeader(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  // Fuzzy fallback: helpful for slightly different headers like
  // "SL NO", "ContactNo.", "Phone#", etc.
  const keys = Object.keys(normalizedRow);
  for (const matcher of fuzzyMatchers) {
    const matchedKey = keys.find((k) => k.includes(matcher));
    if (matchedKey) {
      const value = normalizedRow[matchedKey];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
  }

  return "";
};

const parseFollowUpDateTime = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  // Excel numeric date serial support
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(
        Date.UTC(
          parsed.y,
          parsed.m - 1,
          parsed.d,
          parsed.H || 0,
          parsed.M || 0,
          Math.floor(parsed.S || 0)
        )
      );
    }
  }

  const parsedDate = new Date(value);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  return undefined;
};

const normalizeContactNumber = (value) => {
  if (value === undefined || value === null) return "";

  // Keep special characters, but remove all whitespace.
  // Examples:
  // "080 22 5590" -> "080225590"
  // "9898098781/1090101010" -> "9898098781/1090101010"
  return String(value).trim().replace(/\s+/g, "");
};

exports.createUser = async (req, res) => {
    try {
        req.body.contactNumber = normalizeContactNumber(req.body.contactNumber);

        // Validate required fields
        if (!req.body.contactNumber || !req.body.contactNumber.trim()) {
            return res.status(400).json({ error: "Phone number is required" });
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
    console.log("Bulk upload started");
    console.log("File:", req.file ? req.file.originalname : "No file");

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false
    });

    const isLikelyHeaderRow = (row) => {
      if (!Array.isArray(row) || row.length === 0) return false;
      const normalizedCells = row.map((cell) => normalizeHeader(cell));
      const hasContact = normalizedCells.some(
        (c) => c.includes("contact") || c.includes("mobile") || c.includes("phone")
      );
      const hasCompanyOrName = normalizedCells.some(
        (c) => c.includes("company") || c === "name"
      );
      return hasContact && hasCompanyOrName;
    };

    let headerRowIndex = rawRows.findIndex(isLikelyHeaderRow);
    if (headerRowIndex === -1) {
      headerRowIndex = rawRows.findIndex(
        (row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== "")
      );
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({ message: "No usable rows found in file" });
    }

    const headers = (rawRows[headerRowIndex] || []).map((h) => String(h || "").trim());
    const normalizedHeaders = headers.map((h) => normalizeHeader(h));

    const columnIndexes = {
      company: normalizedHeaders.findIndex((h) => h.includes("company") || h === "name"),
      contact: normalizedHeaders.findIndex(
        (h) => h.includes("contact") || h.includes("mobile") || h.includes("phone")
      ),
      address: normalizedHeaders.findIndex((h) => h.includes("address")),
      status: normalizedHeaders.findIndex((h) => h.includes("status")),
      followUp: normalizedHeaders.findIndex((h) => h.includes("followup") || h.includes("follow")),
      notes: normalizedHeaders.findIndex(
        (h) => h.includes("note") || h.includes("remark") || h.includes("comment")
      )
    };

    const rows = rawRows
      .slice(headerRowIndex + 1)
      .filter((r) => Array.isArray(r) && r.some((cell) => String(cell).trim() !== ""))
      .map((arr, dataIndex) => {
        const obj = {};
        headers.forEach((header, idx) => {
          if (header) obj[header] = arr[idx] ?? "";
        });

        return {
          row: obj,
          arr,
          rowNumber: headerRowIndex + dataIndex + 2
        };
      });

    console.log(`Parsed ${rows.length} rows from Excel`);

    const successUsers = [];
    const failedRows = [];
    const seenPhoneNumbers = new Set();

    const normalizeStatus = (status) => {
      if (!status) return "Select Status";
      const value = status.toLowerCase().trim();
      const map = {
        received: "received",
        "not received": "not_received",
        not_received: "not_received",
        "not recived": "not_received",
        "switch off": "switch_off",
        switch_off: "switch_off",
        callback: "callback",
        required: "required",
        "not required": "not_required",
        not_required: "not_required"
      };
      return map[value] || "Select Status";
    };

    for (let i = 0; i < rows.length; i++) {
      const rowItem = rows[i];
      const row = rowItem.row;
      const arr = rowItem.arr;

      try {
        let companyName = getValueByAliases(
          row,
          ["company name", "company  name", "companyname", "name"],
          ["company", "name"]
        );

        let contactNumberRaw = getValueByAliases(
          row,
          [
            "contact no",
            "contact number",
            "contactnumber",
            "mobile",
            "mobile no",
            "phone",
            "phone number"
          ],
          ["contact", "mobile", "phone"]
        );

        let address = getValueByAliases(row, ["address"], ["address"]);
        let statusValue = getValueByAliases(row, ["status"], ["status"]);
        let notesValue = getValueByAliases(
          row,
          ["notes", "note", "remarks", "comment"],
          ["note", "remark", "comment"]
        );
        let followUpDateRaw = getValueByAliases(
          row,
          ["follow up date", "follow up date time", "followupdate", "followupdatetime"],
          ["followup", "follow"]
        );

        if (!companyName && columnIndexes.company >= 0) companyName = arr[columnIndexes.company];
        if (!contactNumberRaw && columnIndexes.contact >= 0) contactNumberRaw = arr[columnIndexes.contact];
        if (!address && columnIndexes.address >= 0) address = arr[columnIndexes.address];
        if (!statusValue && columnIndexes.status >= 0) statusValue = arr[columnIndexes.status];
        if (!notesValue && columnIndexes.notes >= 0) notesValue = arr[columnIndexes.notes];
        if (!followUpDateRaw && columnIndexes.followUp >= 0) followUpDateRaw = arr[columnIndexes.followUp];

        if (!contactNumberRaw) {
          const phoneLike = arr.find((cell) =>
            /\d{8,}/.test(String(cell || "").replace(/\D/g, ""))
          );
          if (phoneLike) contactNumberRaw = phoneLike;
        }

        const userData = {
          companyName: companyName ? String(companyName).trim() : "",
          contactNumber: normalizeContactNumber(contactNumberRaw),
          address: address ? String(address).trim() : "",
          notes: notesValue ? String(notesValue).trim() : "",
          status: normalizeStatus(statusValue),
          followUpDateTime: parseFollowUpDateTime(followUpDateRaw),
          createdBy: req.user.id
        };

        if (!userData.contactNumber) {
          throw new Error("Phone number is required");
        }

        if (seenPhoneNumbers.has(userData.contactNumber)) {
          throw new Error(`Duplicate phone number in this upload: ${userData.contactNumber}`);
        }

        const existingUser = await User.findOne({
          contactNumber: userData.contactNumber,
          createdBy: req.user.id
        });

        if (existingUser) {
          throw new Error(`Phone number already exists: ${userData.contactNumber}`);
        }

        seenPhoneNumbers.add(userData.contactNumber);
        await User.create(userData);
        successUsers.push(userData);
      } catch (err) {
        failedRows.push({
          rowNumber: rowItem.rowNumber,
          reason: err.message,
          data: row
        });
      }
    }

    res.json({
      message: "Bulk upload completed",
      successCount: successUsers.length,
      failedCount: failedRows.length,
      failedRows
    });
  } catch (err) {
    console.error("Bulk upload error:", err);
    res.status(500).json({
      message: "Bulk upload failed",
      error: err.message
    });
  }
};

exports.getUsers = async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = 10;
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

