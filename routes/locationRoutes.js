const express = require('express');
const router = express.Router();
const { 
    getStates, 
    getDistricts, 
    getCities, 
    getAreas,
    getCitySanghs,
    getAreaSanghs,
    getAvailableStates,
    getAvailableDistricts,
    getAvailableCities,
    getAvailableAreas,
    getSanghByLocation
} = require('../controllers/LocationController');
const { authMiddleware } = require('../middlewares/authMiddlewares');

// Get states with active Sanghs
router.get('/states', authMiddleware, getStates);

// Get districts in state with active Sanghs
router.get('/districts/:state', authMiddleware, getDistricts);

// Get cities in district with active Sanghs
router.get('/cities/:state/:district', authMiddleware, getCities);

// Get areas in city with active Sanghs
router.get('/areas/:state/:district/:city', authMiddleware, getAreas);

// Get all Sanghs in a city
router.get('/sanghs/:state/:district/:city', authMiddleware, getCitySanghs);

// Get all Sanghs in an area
router.get('/sanghs/:state/:district/:city/:area', authMiddleware, getAreaSanghs);

// Get available states where Sanghs exist
router.get('/available-states', getAvailableStates);

// Get available districts in a state where Sanghs exist
router.get('/available-districts/:state', getAvailableDistricts);

// Get available cities in a district where Sanghs exist
router.get('/available-cities/:state/:district', getAvailableCities);

// Get available areas in a city where Sanghs exist
router.get('/available-areas/:state/:district/:city', getAvailableAreas);

// Get Sangh details for a specific location
router.get('/sangh', getSanghByLocation);

module.exports = router;
