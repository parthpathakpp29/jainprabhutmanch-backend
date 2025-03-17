const User = require('../models/UserRegistrationModels/userModel');
const HierarchicalSangh = require('../models/SanghModels/hierarchicalSanghModel');
const { errorResponse } = require('../utils/apiResponse');

// Helper function to check if a level has access to another level
const hasLevelAccess = (userLevel, targetLevel, isSuperAdmin = false) => {
    // Superadmin has access to all levels
    if (isSuperAdmin) return true;

    const levelHierarchy = {
        'country': ['state', 'district', 'city', 'area'],  // Country president can create any level below
        'state': ['district', 'city', 'area'],            // State president can create any level below
        'district': ['city', 'area'],                     // District president can create any level below
        'city': ['area'],                                 // City president can only create area
        'area': []                                        // Area president cannot create any level
    };

    // If user is at country level, they can create any level below country
    if (userLevel === 'country') {
        return levelHierarchy['country'].includes(targetLevel);
    }
    
    // If user is at state level, they can create any level below state
    if (userLevel === 'state') {
        return levelHierarchy['state'].includes(targetLevel);
    }
    
    // If user is at district level, they can create any level below district
    if (userLevel === 'district') {
        return levelHierarchy['district'].includes(targetLevel);
    }
    
    // If user is at city level, they can only create area level
    if (userLevel === 'city') {
        return targetLevel === 'area';
    }
    
    // Area level users cannot create any Sangh
    return false;
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
                if (['state', 'district', 'city', 'area'].includes(targetSangh.level)) {
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
                if (role.level === 'area') {
                    if (sangh.location.area === application.location.area &&
                        sangh.location.city === application.location.city &&
                        sangh.location.district === application.location.district &&
                        sangh.location.state === application.location.state) {
                        hasAuthority = true;
                        break;
                    }
                } else if (role.level === 'city') {
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

// Check if user can post as Sangh
const canPostAsSangh = async (req, res, next) => {
    try {
        const sanghId = req.params.sanghId;
        const userId = req.user._id;
        
        // If user is superadmin, allow access
        if (req.user.role === 'superadmin') {
            // Still need to check if the Sangh exists
            const sangh = await HierarchicalSangh.findById(sanghId);
            if (!sangh) {
                return errorResponse(res, 'Sangh not found', 404);
            }
            
            // Set a default role for superadmin
            req.officeBearerRole = 'president';
            return next();
        }
        
        // Check if user is an office bearer
        const user = await User.findById(userId);
        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }
        
        const officeBearerRole = user.sanghRoles.find(role => 
            role.sanghId.toString() === sanghId && 
            ['president', 'secretary', 'treasurer'].includes(role.role)
        );
        
        if (!officeBearerRole) {
            return errorResponse(res, 'Only office bearers can post on behalf of the Sangh', 403);
        }
        
        // Check if the Sangh exists
        const sangh = await HierarchicalSangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }
        
        // Add role to request for controller use
        req.officeBearerRole = officeBearerRole.role;
        req.sangh = sangh;
        
        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

// Check if user is a Panch member
const isPanchMember = async (req, res, next) => {
    try {
        const { panchId, accessKey } = req.body;
        
        // If user is superadmin, allow access
        if (req.user.role === 'superadmin') {
            return next();
        }
        
        // Find the Panch group
        const Panch = require('../models/SanghModels/panchModel');
        const panchGroup = await Panch.findById(panchId);
        
        if (!panchGroup) {
            return errorResponse(res, 'Panch group not found', 404);
        }
        
        // Check if the access key matches any of the Panch members
        const member = panchGroup.members.find(m => 
            m.accessKey === accessKey && 
            m.status === 'active'
        );
        
        if (!member) {
            return errorResponse(res, 'Invalid access key or inactive member', 403);
        }
        
        // Add Panch group and member to request for controller use
        req.panchGroup = panchGroup;
        req.panchMember = member;
        req.sanghId = panchGroup.sanghId;
        
        next();
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

const canManageAreaSangh = async (req, res, next) => {
    try {
        const { sanghId } = req.params;
        const sangh = await HierarchicalSangh.findById(sanghId);
        
        if (!sangh) {
            return res.status(404).json({
                success: false,
                message: 'Sangh not found'
            });
        }

        if (sangh.level !== 'area') {
            return res.status(403).json({
                success: false,
                message: 'This operation is only allowed for area level Sanghs'
            });
        }

        // Check if user has permission to manage this area
        const hasPermission = req.user.sanghRoles.some(role => 
            (role.level === 'area' && role.sanghId.equals(sanghId)) || // Area level officer
            (role.level === 'city' && sangh.location.city === role.location.city) || // City level officer
            (role.level === 'district' && sangh.location.district === role.location.district) || // District level officer
            (role.level === 'state' && sangh.location.state === role.location.state) || // State level officer
            (role.level === 'country') || // Country level officer
            req.user.role === 'superadmin' // Superadmin
        );

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to manage this area Sangh'
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error checking area Sangh permissions',
            error: error.message
        });
    }
};

module.exports = {
    isPresident,
    isOfficeBearer,
    canAccessLevel,
    canReviewJainAadharByLocation,
    canPostAsSangh,
    isPanchMember,
    canManageAreaSangh
};