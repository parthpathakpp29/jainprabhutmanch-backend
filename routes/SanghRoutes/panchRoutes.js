const express = require('express');
const router = express.Router();
const {
    validateSangh,
    createPanchGroup,
    getPanchGroup,
    getPanchMembers,
    updatePanchStatus,
    editPanchMember,
    deletePanchGroup,
    validatePanchAccess
} = require('../../controllers/SanghControllers/panchController');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const { isPresident } = require('../../middlewares/sanghPermissions');
const { panchGroupDocs } = require('../../middlewares/uploadMiddleware');
const { body } = require('express-validator');

// Protect all routes
router.use(authMiddleware);

// Validate Panch Access
router.post('/validate-access',
    [
        body('panchId').isMongoId().withMessage('Invalid Panch ID'),
        body('jainAadharNumber').notEmpty().withMessage('Jain Aadhar number is required'),
        body('accessKey').notEmpty().withMessage('Access key is required')
    ],
    validatePanchAccess
);

// Validate Sangh ID
// router.get('/validate/:sanghId', validateSangh);

// Panch group management
router.post('/:sanghId/group', isPresident, panchGroupDocs, createPanchGroup);
router.get('/:sanghId/group', getPanchGroup);
router.delete('/:sanghId/group', isPresident, deletePanchGroup);

// Member management routes
router.get('/:sanghId/members', getPanchMembers);
router.put('/:sanghId/members/:panchId/status', isPresident, panchGroupDocs, updatePanchStatus);
router.put('/:sanghId/members/:panchId', isPresident, editPanchMember);

module.exports = router; 