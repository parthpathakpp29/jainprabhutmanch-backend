const asyncHandler = require('express-async-handler');
const JainAadhar = require('../models/UserRegistrationModels/jainAadharModel');
const HierarchicalSangh = require('../models/SanghModels/hierarchicalSanghModel');

// Check if user has permission to edit Jain Aadhar application
const canEditJainAadhar = asyncHandler(async (req, res, next) => {
    try {
        const applicationId = req.params.id;
        const userId = req.user._id;

        // Get the application
        const application = await JainAadhar.findById(applicationId)
            .populate('reviewingSanghId');

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // If application is already approved, no edits allowed
        // if (application.status === 'approved') {
        //     return res.status(403).json({
        //         success: false,
        //         message: 'Cannot edit approved applications'
        //     });
        // }

        // Superadmin can edit any application
        if (req.user.role === 'superadmin') {
            req.editingLevel = 'superadmin';
            return next();
        }

        // Get user's highest Sangh role
        const userSanghRoles = req.user.sanghRoles || [];
        const presidentRole = userSanghRoles.find(role => 
            role.role === 'president' && 
            ['country', 'state', 'district', 'city'].includes(role.level)
        );

        if (!presidentRole) {
            return res.status(403).json({
                success: false,
                message: 'No permission to edit applications'
            });
        }

        // Get the Sangh hierarchy levels
        const hierarchyLevels = ['city', 'district', 'state', 'country'];
        const userLevel = hierarchyLevels.indexOf(presidentRole.level);
        const applicationLevel = hierarchyLevels.indexOf(application.applicationLevel);

        // Check if user's level is appropriate for editing
        if (userLevel < applicationLevel) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to edit applications at this level'
            });
        }

        // For same level, check if it's the correct location
        if (userLevel === applicationLevel) {
            const userSangh = await HierarchicalSangh.findById(presidentRole.sanghId);
            if (!userSangh) {
                return res.status(404).json({
                    success: false,
                    message: 'Sangh not found'
                });
            }

            // Check location match based on level
            const locationMatch = checkLocationMatch(userSangh.location, application.location, presidentRole.level);
            if (!locationMatch) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only edit applications from your jurisdiction'
                });
            }
        }

        // Store editing level and Sangh for controller use
        req.editingLevel = presidentRole.level;
        req.editingSanghId = presidentRole.sanghId;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error checking edit permissions',
            error: error.message
        });
    }
});

// Helper function to check location match
const checkLocationMatch = (sanghLocation, applicationLocation, level) => {
    switch (level) {
        case 'area':
            return sanghLocation.state === applicationLocation.state &&
                   sanghLocation.district === applicationLocation.district &&
                   sanghLocation.city === applicationLocation.city &&
                   sanghLocation.area === applicationLocation.area;
        case 'city':
            return sanghLocation.state === applicationLocation.state &&
                   sanghLocation.district === applicationLocation.district &&
                   sanghLocation.city === applicationLocation.city;
        case 'district':
            return sanghLocation.state === applicationLocation.state &&
                   sanghLocation.district === applicationLocation.district;
        case 'state':
            return sanghLocation.state === applicationLocation.state;
        case 'country':
            return true; // Country president can edit any location
        default:
            return false;
    }
};

module.exports = {
    canEditJainAadhar
};
