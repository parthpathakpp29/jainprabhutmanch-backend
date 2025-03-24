const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
    validateSangh,
    createPanchGroup,
    getPanchGroup,
    getPanchMembers,
    updatePanchStatus,
    editPanchMember,
    deletePanchGroup
} = require('../../controllers/SanghControllers/panchController');
const { authMiddleware, verifyPanchRole } = require('../../middlewares/authMiddlewares');
const { isPresident } = require('../../middlewares/sanghPermissions');
const { panchGroupDocs } = require('../../middlewares/uploadMiddleware');
const { body } = require('express-validator');

// Rate limiters
const createPanchLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per window
    message: 'Too many Panch group creation attempts, please try again later'
});

// Protect all routes
router.use(authMiddleware);

// Panch group management with rate limiting
router.post('/:sanghId/group', createPanchLimiter, isPresident, panchGroupDocs, createPanchGroup);
router.get('/:sanghId/group', getPanchGroup);
router.get('/:panchId/members', getPanchMembers);

// Panch member management
router.put('/:panchId/member/:memberId', verifyPanchRole, editPanchMember);
router.put('/:panchId/status', verifyPanchRole, updatePanchStatus);
router.delete('/:panchId', verifyPanchRole, deletePanchGroup);

module.exports = router;