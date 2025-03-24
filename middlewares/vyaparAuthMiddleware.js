const JainVyapar = require('../models/VyaparModels/vyaparModel');
const HierarchicalSangh = require('../models/SanghModels/hierarchicalSanghModel');
const { errorResponse } = require('../utils/apiResponse');
const UserRoleService = require('../services/userRoleService');

// Verify business owner using JWT token and role
const verifyBusinessOwner = async (req, res, next) => {
    try {
        const { vyaparId } = req.params;
        const userId = req.user._id;

        // If user is superadmin, grant full access
        if (req.user.role === 'superadmin' || req.user.role === 'admin') {
            const business = await JainVyapar.findById(vyaparId);
            if (!business) {
                return errorResponse(res, 'Business not found', 404);
            }
            req.business = business;
            return next();
        }

        // Check if user has owner role for this business
        const hasVyaparRole = req.user.vyaparRoles && req.user.vyaparRoles.some(role => 
            role.vyaparId.toString() === vyaparId && role.role === 'owner'
        );

        if (!hasVyaparRole) {
            return errorResponse(res, 'You do not have permission to access this business', 403);
        }

        const business = await JainVyapar.findById(vyaparId);
        if (!business) {
            return errorResponse(res, 'Business not found', 404);
        }

        req.business = business;
        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

// Verify if user can review business (city president)
const canReviewBusiness = async (req, res, next) => {
    try {
        let citySanghId;
        
        // For review endpoint, first get the business details
        if (req.params.vyaparId) {
            const business = await JainVyapar.findById(req.params.vyaparId);
            if (!business) {
                return errorResponse(res, 'Business not found', 404);
            }
            citySanghId = business.citySanghId;
            req.business = business;
        } else {
            // For pending applications endpoint
            citySanghId = req.params.citySanghId;
        }

        if (!citySanghId) {
            return errorResponse(res, 'City Sangh ID is required', 400);
        }
        
        // Check if user has president role for this city
        const hasPresidentRole = req.user.sanghRoles && req.user.sanghRoles.some(role => 
            role.sanghId.toString() === citySanghId.toString() && 
            role.role === 'president'
        );
        
        if (!hasPresidentRole) {
            return errorResponse(res, 'Unauthorized: Only city president can perform this action', 403);
        }
        
        // Get the city Sangh for additional context if needed
        const citySangh = await HierarchicalSangh.findOne({
            _id: citySanghId,
            level: 'city'
        });
        
        if (!citySangh) {
            return errorResponse(res, 'City Sangh not found', 404);
        }
        
        req.citySangh = citySangh;
        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

// Verify business post management permissions
const canManageBusinessPost = async (req, res, next) => {
    try {
        const { vyaparId } = req.params;
        const userId = req.user._id;
        
        if (!vyaparId) {
            return errorResponse(res, 'Business ID required', 400);
        }

        // If user is superadmin, grant full access
        if (req.user.role === 'superadmin' || req.user.role === 'admin') {
            const business = await JainVyapar.findById(vyaparId);
            if (!business) {
                return errorResponse(res, 'Business not found', 404);
            }
            req.business = business;
            return next();
        }

        // Check if user has manager or owner role for this business
        const hasVyaparRole = req.user.vyaparRoles && req.user.vyaparRoles.some(role => 
            role.vyaparId.toString() === vyaparId && 
            ['owner', 'manager', 'admin'].includes(role.role)
        );

        if (!hasVyaparRole) {
            return errorResponse(res, 'Unauthorized: Only business managers can perform this action', 403);
        }

        const business = await JainVyapar.findOne({
            _id: vyaparId,
            applicationStatus: 'approved',
            status: 'active'
        });

        if (!business) {
            return errorResponse(res, 'Business not found or inactive', 404);
        }

        req.business = business;
        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

module.exports = {
    verifyBusinessOwner,
    canReviewBusiness,
    canManageBusinessPost
};
