const User = require('../models/UserRegistrationModels/userModel');
const Sangh = require('../models/SanghModels/sanghModel');
const { errorResponse } = require('../utils/apiResponse');

// Helper function to check if a level has access to another level
const hasLevelAccess = (userLevel, targetLevel) => {
    const levelHierarchy = {
        'country': ['country', 'state', 'district', 'city'],
        'state': ['state', 'district', 'city'],
        'district': ['district', 'city'],
        'city': ['city']
    };
    return levelHierarchy[userLevel]?.includes(targetLevel) || false;
};

// Check if user is president of the Sangh
const isPresident = async (req, res, next) => {
    try {
        const sanghId = req.params.sanghId || req.params.id;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }

        const targetSangh = await Sangh.findById(sanghId);
        if (!targetSangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        // Get user's president roles
        const presidentRoles = user.sanghRoles.filter(role => role.role === 'president');

        let hasAccess = false;
        for (const role of presidentRoles) {
            // Direct presidency
            if (role.sanghId.toString() === sanghId) {
                hasAccess = true;
                break;
            }

            // Higher level access check
            const presidentSangh = await Sangh.findById(role.sanghId);
            if (presidentSangh) {
                // For district president
                if (role.level === 'district') {
                    if (targetSangh.level === 'city' && 
                        presidentSangh.location.district === targetSangh.location.district) {
                        hasAccess = true;
                        break;
                    }
                }
                // For state president
                else if (role.level === 'state') {
                    if ((targetSangh.level === 'district' || targetSangh.level === 'city') && 
                        presidentSangh.location.state === targetSangh.location.state) {
                        hasAccess = true;
                        break;
                    }
                }
                // For country president
                else if (role.level === 'country') {
                    if (['state', 'district', 'city'].includes(targetSangh.level)) {
                        hasAccess = true;
                        break;
                    }
                }
            }
        }

        if (!hasAccess) {
            return errorResponse(res, 'Only the President can perform this action', 403);
        }

        // Store target Sangh and president role in request for later use
        req.sangh = targetSangh;
        req.presidentRole = presidentRoles.find(role => {
            if (role.sanghId.toString() === sanghId) return true;
            const levelHierarchy = {
                'country': ['state', 'district', 'city'],
                'state': ['district', 'city'],
                'district': ['city']
            };
            return levelHierarchy[role.level]?.includes(targetSangh.level);
        });

        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

// Check if user is an office bearer
const isOfficeBearer = async (req, res, next) => {
    try {
        const sanghId = req.params.sanghId || req.params.id;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }

        const sangh = await Sangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        // Check if user has any office bearer role for this Sangh or higher level access
        const officeBearerRoles = user.sanghRoles.filter(role => 
            ['president', 'secretary', 'treasurer'].includes(role.role)
        );

        const hasAccess = officeBearerRoles.some(role => {
            return role.sanghId.toString() === sanghId || 
                   hasLevelAccess(role.level, sangh.level);
        });

        if (!hasAccess) {
            return errorResponse(res, 'Only office bearers can perform this action', 403);
        }

        req.sangh = sangh;
        req.userRole = officeBearerRoles.find(role => 
            role.sanghId.toString() === sanghId || 
            hasLevelAccess(role.level, sangh.level)
        ).role;
        
        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

// Middleware to check if user has access to the target level
const canAccessLevel = async (req, res, next) => {
    try {
        const sangh = req.sangh;
        const presidentRole = req.presidentRole;

        if (!presidentRole) {
            return errorResponse(res, 'President role not found', 403);
        }

        if (!hasLevelAccess(presidentRole.level, sangh.level)) {
            return errorResponse(res, `Presidents at ${presidentRole.level} level cannot modify ${sangh.level} level Sanghs`, 403);
        }

        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

module.exports = {
    isPresident,
    isOfficeBearer,
    canAccessLevel
};