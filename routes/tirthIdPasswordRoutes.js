const express = require('express');
const { createTirthIdPassword } = require('../controllers/tirthIdPasswordController');
const router = express.Router();

router.post('/create', createTirthIdPassword);

module.exports = router;
