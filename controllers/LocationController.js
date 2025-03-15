const HierarchicalSangh = require('../models/SanghModels/hierarchicalSanghModel');
const asyncHandler = require('express-async-handler');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// Get states where active Sanghs exist
const getStates = asyncHandler(async (req, res) => {
    try {
        const states = await HierarchicalSangh.distinct('location.state', {
            status: 'active'
        });
        return successResponse(res, states, 'States retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Get districts in a state where active Sanghs exist
const getDistricts = asyncHandler(async (req, res) => {
    try {
        const { state } = req.params;
        const districts = await HierarchicalSangh.distinct('location.district', {
            status: 'active',
            'location.state': state,
            'location.district': { $exists: true, $ne: '' }
        });
        return successResponse(res, districts, 'Districts retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Get cities in a district where active Sanghs exist
const getCities = asyncHandler(async (req, res) => {
    try {
        const { state, district } = req.params;
        const cities = await HierarchicalSangh.distinct('location.city', {
            status: 'active',
            'location.state': state,
            'location.district': district,
            'location.city': { $exists: true, $ne: '' }
        });
        return successResponse(res, cities, 'Cities retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Get areas in a city where active Sanghs exist
const getAreas = asyncHandler(async (req, res) => {
    try {
        const { state, district, city } = req.params;
        const areas = await HierarchicalSangh.distinct('location.area', {
            status: 'active',
            'location.state': state,
            'location.district': district,
            'location.city': city,
            'location.area': { $exists: true, $ne: '' }
        });
        return successResponse(res, areas, 'Areas retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Get Sanghs in a city
const getCitySanghs = asyncHandler(async (req, res) => {
    try {
        const { state, district, city } = req.params;
        const sanghs = await HierarchicalSangh.find({
            status: 'active',
            'location.state': state,
            'location.district': district,
            'location.city': city,
            level: 'city'
        }).select('name level location officeBearers.role officeBearers.name');
        
        return successResponse(res, sanghs, 'Sanghs retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Get Sanghs in an area
const getAreaSanghs = asyncHandler(async (req, res) => {
    try {
        const { state, district, city, area } = req.params;
        const sanghs = await HierarchicalSangh.find({
            status: 'active',
            'location.state': state,
            'location.district': district,
            'location.city': city,
            'location.area': area,
            level: 'area'
        }).select('name level location officeBearers.role officeBearers.name');
        
        return successResponse(res, sanghs, 'Area Sanghs retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

module.exports = {
    getStates,
    getDistricts,
    getCities,
    getAreas,
    getCitySanghs,
    getAreaSanghs
};
