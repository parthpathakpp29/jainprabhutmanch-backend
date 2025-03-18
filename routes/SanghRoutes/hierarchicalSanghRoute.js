const express = require('express');
const router = express.Router();
const { authMiddleware, isSuperAdmin } = require('../../middlewares/authMiddlewares');
const { validateSanghAccess, canCreateLowerLevelSangh, validateLocationHierarchy } = require('../../middlewares/sanghAuthMiddleware');
const { isOfficeBearer, canManageAreaSangh } = require('../../middlewares/sanghPermissions');
const {
    createHierarchicalSangh,
    getHierarchy,
    getSanghsByLevelAndLocation,
    getChildSanghs,
    updateHierarchicalSangh,
    addSanghMember,
    removeSanghMember,
    updateMemberDetails,
    getSanghMembers,
    addMultipleSanghMembers,
    checkOfficeBearerTerms
} = require('../../controllers/SanghControllers/hierarchicalSanghController');

const upload = require('../../middlewares/uploadMiddleware');

// Protect all routes
router.use(authMiddleware);

// Helper middleware to check if user can create a Sangh
const checkSanghCreationPermission = async (req, res, next) => {
    try {
        // Superadmins can create any Sangh
        if (req.user.role === 'superadmin') {
            return next();
        }
        
        // Country-level presidents can create state-level Sanghs
        const userRole = req.user.sanghRoles.find(role => 
            role.role === 'president' && role.level === 'country'
        );
        
        if (userRole && req.body.level !== 'country') {
            // For non-country level Sanghs, set up the parent Sangh access
            const parentSanghId = req.body.parentSanghId || req.body.parentSangh;
            
            if (parentSanghId) {
                const SanghAccess = require('../../models/SanghModels/sanghAccessModel');
                const mongoose = require('mongoose');
                
                // If parentSanghAccessId is provided directly
                if (req.body.parentSanghAccessId) {
                    // Check if it's a valid ObjectId
                    if (mongoose.Types.ObjectId.isValid(req.body.parentSanghAccessId)) {
                        const parentSanghAccess = await SanghAccess.findById(req.body.parentSanghAccessId);
                        if (parentSanghAccess) {
                            req.sanghAccess = parentSanghAccess;
                            return next();
                        }
                    } else {
                        // It might be an access code string
                        const parentSanghAccess = await SanghAccess.findOne({ 
                            accessId: req.body.parentSanghAccessId,
                            status: 'active'
                        });
                        
                        if (parentSanghAccess) {
                            req.sanghAccess = parentSanghAccess;
                            return next();
                        }
                    }
                }
                
                // If no valid parentSanghAccessId was found, try to find by sanghId
                const parentSanghAccess = await SanghAccess.findOne({ 
                    sanghId: parentSanghId,
                    status: 'active'
                });
                
                if (!parentSanghAccess) {
                    return res.status(404).json({
                        success: false,
                        message: 'Parent Sangh access not found'
                    });
                }
                
                req.sanghAccess = parentSanghAccess;
            }
            return next();
        }
        
        // For other users, check if they can create a lower level Sangh
        canCreateLowerLevelSangh(req, res, next);
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error checking Sangh creation permission',
            error: error.message
        });
    }
};

// Create new Sangh (Protected + Requires ability to create lower level)
router.post('/create', 
    upload.sangathanDocs,
    checkSanghCreationPermission,
    (req, res, next) => {
        if (req.user.role === 'superadmin') {
            return next();
        }
        validateLocationHierarchy(req, res, next);
    },
    createHierarchicalSangh
);

// Get Sangh hierarchy
router.get('/hierarchy/:id', 
    validateSanghAccess,
    getHierarchy
);

// Get Sanghs by level and location
router.get('/search', 
    getSanghsByLevelAndLocation
);

// Get child Sanghs
router.get('/children/:id', 
    validateSanghAccess,
    getChildSanghs
);

// Update Sangh (Requires office bearer permission)
router.patch('/update/:id', 
    upload.sangathanDocs,
    (req, res, next) => {
        if (req.user.role === 'superadmin') {
            return next();
        }
        validateSanghAccess(req, res, next);
    },
    updateHierarchicalSangh
);

// Member management routes with updated permissions
router.post('/:sanghId/members', 
    (req, res, next) => {
        if (req.user.role === 'superadmin') {
            return next();
        }
        isOfficeBearer(req, res, next);
    },
    upload.fields([
        { name: 'memberJainAadhar', maxCount: 1 },
        { name: 'memberPhoto', maxCount: 1 }
    ]),
    validateSanghAccess,
    addSanghMember
);

router.delete('/:sanghId/members/:memberId', 
    isOfficeBearer,
    validateSanghAccess,
    removeSanghMember
);

router.put('/:sanghId/members/:memberId', 
    isOfficeBearer,
    upload.fields([
        { name: 'memberJainAadhar', maxCount: 1 },
        { name: 'memberPhoto', maxCount: 1 }
    ]),
    validateSanghAccess,
    updateMemberDetails
);

router.get('/:sanghId/members', 
    validateSanghAccess,
    getSanghMembers
);

router.get('/:sanghId/check-terms', 
    authMiddleware,
    checkOfficeBearerTerms
);

// Area-specific routes
router.put('/area/:sanghId', 
    authMiddleware,
    canManageAreaSangh,
    updateHierarchicalSangh
);

router.post('/area/:sanghId/members',
    authMiddleware,
    canManageAreaSangh,
    addSanghMember
);

router.delete('/area/:sanghId/members/:memberId',
    authMiddleware,
    canManageAreaSangh,
    removeSanghMember
);

module.exports = router; 