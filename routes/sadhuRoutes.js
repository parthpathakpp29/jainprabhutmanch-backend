const express = require('express');
const { createSadhu } = require('../controllers/sadhuController');

const router = express.Router();

// POST request to create Sadhu ID and Password
router.post('/create', createSadhu);

module.exports = router;
