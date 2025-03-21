const express = require('express');
const { createSadhuInfo, getAllSadhuInfo, getSadhuInfoById } = require('../controllers/SadhuInfoController');
const router = express.Router();


// Define routes for SadhuInfo
router.post('/', createSadhuInfo); 
router.get('/', getAllSadhuInfo); 
router.get('/:id', getSadhuInfoById); 

module.exports = router;
