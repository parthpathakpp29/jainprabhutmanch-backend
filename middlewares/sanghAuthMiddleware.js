const asyncHandler = require('express-async-handler');
const SanghAccess = require('../models/SanghModels/sanghAccessModel');
const HierarchicalSangh = require('../models/SanghModels/hierarchicalSanghModel');
const User = require('../models/UserRegistrationModels/userModel');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// Helper function to get parent Sangh access
const getParentSanghAccess = async (parentSanghId) => {
    const parentSanghAccess = await SanghAccess.findOne({ 
        sanghId: parentSanghId,
        status: 'active'
    });
    
    if (!parentSanghAccess) {
        throw new Error('Parent Sangh access not found');
    }
    
    return parentSanghAccess;
};

// Validate Sangh Access
const validateSanghAccess = asyncHandler(async (req, res, next) => {
    try {
        const sanghId = req.params.sanghId || req.params.id;
        const userId = req.user._id;

        // Find the hierarchical sangh
        const sangh = await HierarchicalSangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        // Check if user is an office bearer of this Sangh
        const user = await User.findById(userId);
        const hasRole = user.sanghRoles.some(role => 
            role.sanghId.toString() === sanghId &&
            ['president', 'secretary', 'treasurer'].includes(role.role)
        );

        if (!hasRole) {
            return errorResponse(res, 'You are not authorized to access this Sangh', 403);
        }

        // Add Sangh to request
        req.sangh = sangh;
        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Check if user can create lower level Sangh
const canCreateLowerLevelSangh = asyncHandler(async (req, res, next) => {
    try {
        const { level, parentSangh, parentSanghId, parentSanghAccessId } = req.body;
        const mongoose = require('mongoose');
        
        // If req.sanghAccess is not set, try to find it
        if (!req.sanghAccess) {
            // First try to use parentSanghAccessId if provided
            if (parentSanghAccessId) {
                try {
                    if (mongoose.Types.ObjectId.isValid(parentSanghAccessId)) {
                        // It's a valid ObjectId
                        req.sanghAccess = await SanghAccess.findById(parentSanghAccessId);
                    } else {
                        // It might be an access code string
                        req.sanghAccess = await SanghAccess.findOne({ 
                            accessId: parentSanghAccessId,
                            status: 'active'
                        });
                    }
                } catch (error) {
                    console.error("Error finding parent Sangh access by ID:", error);
                }
            }
            
            // If still not found, try to find by parentSanghId or parentSangh
            if (!req.sanghAccess) {
                const parentId = parentSanghId || parentSangh;
                if (parentId) {
                    try {
                        req.sanghAccess = await getParentSanghAccess(parentId);
                    } catch (error) {
                        return errorResponse(res, error.message, 404);
                    }
                }
            }
        }
        
        const parentSanghAccess = req.sanghAccess;
        
        if (!parentSanghAccess) {
            return errorResponse(res, 'Parent Sangh access is required', 400);
        }

        const hierarchyOrder = ['country', 'state', 'district', 'city'];
        const parentIndex = hierarchyOrder.indexOf(parentSanghAccess.level);
        const newIndex = hierarchyOrder.indexOf(level);

        if (newIndex <= parentIndex || newIndex - parentIndex !== 1) {
            return errorResponse(res, 
                `${parentSanghAccess.level} level can only create ${hierarchyOrder[parentIndex + 1]} level Sanghs`, 
                403
            );
        }

        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Validate location hierarchy
const validateLocationHierarchy = asyncHandler(async (req, res, next) => {
    try {
        const { level, location, parentSangh } = req.body;
        
        // If req.sanghAccess is not set, try to find it
        if (!req.sanghAccess && parentSangh) {
            try {
                req.sanghAccess = await getParentSanghAccess(parentSangh);
            } catch (error) {
                return errorResponse(res, error.message, 404);
            }
        }
        
        const parentSanghAccess = req.sanghAccess;
        
        if (!parentSanghAccess) {
            return errorResponse(res, 'Parent Sangh access is required for location validation', 400);
        }

        switch (level) {
            case 'state':
                if (location.country !== parentSanghAccess.location.country) {
                    return errorResponse(res, 'State must belong to the parent country', 400);
                }
                break;
            case 'district':
                if (location.state !== parentSanghAccess.location.state) {
                    return errorResponse(res, 'District must belong to the parent state', 400);
                }
                break;
            case 'city':
                if (location.district !== parentSanghAccess.location.district) {
                    return errorResponse(res, 'City must belong to the parent district', 400);
                }
                break;
        }

        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

module.exports = {
    validateSanghAccess,
    canCreateLowerLevelSangh,
    validateLocationHierarchy
}; 