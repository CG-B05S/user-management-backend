const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const { bulkUploadUsers } = require("../controllers/userController");

const {
  createUser,
  getUsers,
  updateUser,
  deleteUser
} = require("../controllers/userController");

router.post("/", auth, createUser);
router.post("/bulk-upload", auth , upload.single("file"), bulkUploadUsers);
router.get("/", auth, getUsers);
router.put("/:id", auth, updateUser);
router.delete("/:id", auth, deleteUser);

module.exports = router;
