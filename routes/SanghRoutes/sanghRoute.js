// server/routes/SanghRoutes/sanghRoute.js
const express = require('express');
const router = express.Router();
const {
  createSangh,
  getAllSanghs,
  getSanghById,
  manageMember,
  updateSangh,
  getHierarchy,
  editMemberDetails,
  checkTenureStatus,
  replaceOfficeBearer,
  getTenureHistory
} = require('../../controllers/SanghControllers/sanghController');
const { authMiddleware, isAdmin } = require('../../middlewares/authMiddlewares');
const { sangathanDocs } = require('../../middlewares/uploadMiddleware');
const { isPresident, isOfficeBearer } = require('../../middlewares/sanghPermissions');

// Protect all routes
router.use(authMiddleware);

// Sangh management routes
router.post('/create', sangathanDocs, createSangh);
router.get('/', getAllSanghs);
router.get('/:id', getSanghById);
router.put('/:id', isPresident, sangathanDocs, updateSangh);

// Member management routes
router.post('/:sanghId/members', isPresident, manageMember);
router.delete('/:sanghId/members/:memberId', isPresident, manageMember);
router.put('/:sanghId/members/:memberId', isPresident, sangathanDocs, editMemberDetails);

// Hierarchy routes
router.get('/:id/hierarchy', getHierarchy);

// Office bearer management routes
router.get('/:sanghId/tenure-status', isOfficeBearer, checkTenureStatus);
router.post('/:sanghId/replace-bearer', isPresident, sangathanDocs, replaceOfficeBearer);
router.get('/:sanghId/tenure-history', isOfficeBearer, getTenureHistory);

module.exports = router;