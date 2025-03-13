const User = require('../models/UserRegistrationModels/userModel');
const HierarchicalSangh = require('../models/SanghModels/hierarchicalSanghModel');
const { errorResponse } = require('../utils/apiResponse');

// Helper function to check if a level has access to another level
const hasLevelAccess = (userLevel, targetLevel, isSuperAdmin = false) => {
    // Superadmin has access to all levels
    if (isSuperAdmin) return true;

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

        // If user is superadmin, grant full access
        if (req.user.role === 'superadmin') {
            const targetSangh = await HierarchicalSangh.findById(sanghId);
            if (!targetSangh) {
                return errorResponse(res, 'Sangh not found', 404);
            }
            req.sangh = targetSangh;
            req.presidentRole = { level: 'country' }; // Give highest level access
            return next();
        }

        const user = await User.findById(userId);
        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }

        const targetSangh = await HierarchicalSangh.findById(sanghId);
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

            // Higher level access check - Country president gets full access to lower levels
            const presidentSangh = await HierarchicalSangh.findById(role.sanghId);
            if (presidentSangh && role.level === 'country') {
                if (['state', 'district', 'city'].includes(targetSangh.level)) {
                    hasAccess = true;
                    break;
                }
            }
            // Other level presidents maintain their regular hierarchy
            else if (presidentSangh) {
                if (hasLevelAccess(role.level, targetSangh.level)) {
                    hasAccess = true;
                    break;
                }
            }
        }

        if (!hasAccess) {
            return errorResponse(res, 'Only the President can perform this action', 403);
        }

        req.sangh = targetSangh;
        req.presidentRole = presidentRoles.find(role => {
            if (role.sanghId.toString() === sanghId) return true;
            return hasLevelAccess(role.level, targetSangh.level);
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

        const sangh = await HierarchicalSangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        // Check if user has any office bearer role for this Sangh or higher level access
        const officeBearerRoles = user.sanghRoles.filter(role => 
            ['president', 'secretary', 'treasurer'].includes(role.role)
        );

        const hasAccess = officeBearerRoles.some(role => {
            const hasDirectAccess = role.sanghId.toString() === sanghId;
            const hasHierarchicalAccess = hasLevelAccess(role.level, sangh.level);
            return hasDirectAccess || hasHierarchicalAccess;
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

// Check if user can review Jain Aadhar applications based on location
const canReviewJainAadharByLocation = async (req, res, next) => {
    try {
        const { applicationId } = req.params;
        const userId = req.user._id;
        
        // If user is superadmin, allow access
        if (req.user.role === 'superadmin') {
            return next();
        }
        
        // If user is admin with verify permissions, allow access
        if (req.user.role === 'admin' && req.user.adminPermissions.includes('verify_jain_aadhar')) {
            return next();
        }
        
        // Get the application
        const JainAadhar = require('../models/UserRegistrationModels/jainAadharModel');
        const application = await JainAadhar.findById(applicationId);
        
        if (!application) {
            return errorResponse(res, 'Application not found', 404);
        }
        
        // Check if user has president role at the appropriate level
        const user = await User.findById(userId);
        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }
        
        // Get user's president roles
        const presidentRoles = user.sanghRoles.filter(role => role.role === 'president');
        
        if (presidentRoles.length === 0) {
            return errorResponse(res, 'Only presidents can review applications', 403);
        }
        
        // Check if any of the user's president roles match the application level and location
        let hasAuthority = false;
        for (const role of presidentRoles) {
            if (role.level === application.applicationLevel) {
                const sangh = await HierarchicalSangh.findById(role.sanghId);
                if (!sangh) continue;
                
                // Check location match based on level
                if (role.level === 'city') {
                    if (sangh.location.city === application.location.city &&
                        sangh.location.district === application.location.district &&
                        sangh.location.state === application.location.state) {
                        hasAuthority = true;
                        break;
                    }
                } else if (role.level === 'district') {
                    if (sangh.location.district === application.location.district &&
                        sangh.location.state === application.location.state) {
                        hasAuthority = true;
                        break;
                    }
                } else if (role.level === 'state') {
                    if (sangh.location.state === application.location.state) {
                        hasAuthority = true;
                        break;
                    }
                } else if (role.level === 'country') {
                    hasAuthority = true;
                    break;
                }
            }
        }
        
        if (!hasAuthority) {
            return errorResponse(res, 'You do not have authority to review this application', 403);
        }
        
        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

module.exports = {
    isPresident,
    isOfficeBearer,
    canAccessLevel,
    canReviewJainAadharByLocation
};