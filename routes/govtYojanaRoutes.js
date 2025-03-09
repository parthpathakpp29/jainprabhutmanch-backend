const express = require("express");
const upload = require("../middlewares/uploadMiddleware");
const router = express.Router();
const govtYojanaController = require('../controllers/govtYojanaController')

//  API Routes
router.post("/create", upload.single("image"), govtYojanaController.createYojana);
router.get("/all", govtYojanaController.getAllYojanas);
router.delete("/delete/:id", govtYojanaController.deleteYojana);

module.exports = router;
