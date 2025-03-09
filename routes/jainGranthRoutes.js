const express = require("express");
const upload = require("../middlewares/uploadMiddleware");
const { uploadGranth, getAllGranths } = require("../controllers/jainGranthController");

const router = express.Router();

router.post("/upload", upload.single("file"), uploadGranth); // Upload Granth
router.get("/all", getAllGranths); // Get All Granths

module.exports = router;
