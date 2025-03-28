const express = require('express');
const { 
  createReport, 
  getReportById, 
  getAllReports, 
  updateReport, 
  deleteReport,
  getSubmittedReports,
  getReceivedReports,
  updateReportStatus
} = require('../controllers/reportingController');
const { authMiddleware } = require('../middlewares/authMiddlewares');
const { validateRequest } = require('../middlewares/validationMiddleware');
const { check } = require('express-validator');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Validation rules
const reportValidation = [
  check('ikaiName').notEmpty().withMessage('Ikai name is required'),
  check('presidentName').notEmpty().withMessage('President name is required'),
  check('secretaryName').notEmpty().withMessage('Secretary name is required'),
  check('treasurerName').notEmpty().withMessage('Treasurer name is required'),
  check('reportMonth').isInt({ min: 1, max: 12 }).withMessage('Valid report month is required'),
  check('reportYear').isInt({ min: 2000 }).withMessage('Valid report year is required'),
  check('generalMeetingCount').isInt({ min: 0 }).withMessage('General meeting count must be a positive number'),
  check('boardMeetingCount').isInt({ min: 0 }).withMessage('Board meeting count must be a positive number'),
  check('membership').notEmpty().withMessage('Membership information is required'),
  check('jainAadharCount').isInt({ min: 0 }).withMessage('Jain Aadhar count must be a positive number'),
  check('projects').notEmpty().withMessage('Projects information is required'),
  check('events').notEmpty().withMessage('Events information is required'),
  check('submittingSanghId').notEmpty().withMessage('Submitting Sangh ID is required')
];

const statusValidation = [
  check('status').isIn(['submitted', 'reviewed', 'approved']).withMessage('Invalid status')
];

// POST: Create a new report
router.post('/', reportValidation, validateRequest, createReport);

// GET: Get reports submitted by a specific Sangh
router.get('/submitted/:sanghId', getSubmittedReports);

// GET: Get reports received by a specific Sangh
router.get('/received/:sanghId', getReceivedReports);

// GET: Get a single report by ID
router.get('/:id', getReportById);

// GET: Get all reports (with filtering)
router.get('/', getAllReports);

// PUT: Update a report by ID
router.put('/:id', reportValidation, validateRequest, updateReport);

// PATCH: Update report status and feedback
router.patch('/:id/status', statusValidation, validateRequest, updateReportStatus);

// DELETE: Delete a report by ID
router.delete('/:id', deleteReport);

module.exports = router;
