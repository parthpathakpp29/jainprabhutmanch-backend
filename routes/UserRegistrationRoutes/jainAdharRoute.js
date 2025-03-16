const express = require('express');
const router = express.Router();
const { 
  createJainAadhar,
  getApplicationStatus,
  getAllApplications,
  reviewApplication,
  getApplicationStats,
  getApplicationDetails,
  addReviewComment,
  getApplicationsByLevel,
  reviewApplicationByLevel,
  getVerifiedMembers,
  getApplicationsForReview,
  editJainAadhar,
  checkExistingApplication,
  getUserApplication
} = require('../../controllers/UserRegistrationControllers/jainAdharController');
const { authMiddleware, canReviewJainAadhar } = require('../../middlewares/authMiddlewares');
const { canEditJainAadhar } = require('../../middlewares/jainAadharEditPermissions');
const { canReviewJainAadharByLocation } = require('../../middlewares/sanghPermissions');
const upload = require('../../middlewares/uploadMiddleware');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');

// Rate limiting for application submission
// const applicationLimiter = rateLimit({
//   windowMs: 24 * 60 * 60 * 1000, // 24 hours
//   max: 3, // limit each IP to 1 application per day
//   message: {
//     success: false,
//     message: 'Too many applications. Please try again tomorrow.'
//   },
//   standardHeaders: true,
//   keyGenerator: (req) => req.user ? req.user.id : req.ip // Use user ID if available
// });

// Rate limiting for status checks
const statusCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per 15 minutes
  message: {
    success: false,
    message: 'Too many status checks. Please try again later.'
  }
});

// Protected routes (require authentication)
router.use(authMiddleware);

// User routes
router.post(
  '/apply',
  // applicationLimiter,
  upload.jainAadharDocs,
  [
    body('name').notEmpty().withMessage('Name is required'),
    // body('phoneNumber').isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
    body('dob').notEmpty().withMessage('Date of birth is required'),
    body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
    body('mulJain').isIn(['Digamber', 'Shwetamber']).withMessage('Invalid mulJain value'),
    body('subCaste').isIn(['Parwar', 'Khandelwal', 'Porwal', 'Golalare', 'Golapurab']).withMessage('Invalid subCaste value')
  ],
  checkExistingApplication,
  createJainAadhar
);

router.get(
  '/status',
  statusCheckLimiter,
  getApplicationStatus
);

// Get user's own application details
router.get(
  '/my-application',
  getUserApplication
);

// Admin/Superadmin routes (require review permissions)
router.use(canReviewJainAadhar);

// Admin application management
router.get(
  '/applications',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status value'),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Invalid sort order')
  ],
  getAllApplications
);

// Get applications for review based on reviewer's authority level
router.get(
    '/applications/for-review',
    getApplicationsForReview
);

router.get(
  '/applications/stats',
  getApplicationStats
);

router.get(
  '/applications/:id',
  [
    param('id').isMongoId().withMessage('Invalid application ID')
  ],
  getApplicationDetails
);

// Admin review actions
router.put(
  '/applications/:id/review',
  [
    param('id').isMongoId().withMessage('Invalid application ID'),
    body('status').isIn(['approved', 'rejected']).withMessage('Status must be either approved or rejected'),
    body('remarks').optional().isString().withMessage('Remarks must be a string')
  ],
  reviewApplication
);

router.post(
  '/applications/:id/comment',
  [
    param('id').isMongoId().withMessage('Invalid application ID'),
    body('comment').notEmpty().withMessage('Comment is required')
  ],
  addReviewComment
);

// Get applications by specific level - for backward compatibility
router.get(
    '/applications/level/:level',
    [
        param('level').isIn(['superadmin', 'country', 'state', 'district', 'city']).withMessage('Invalid level')
    ],
    getApplicationsByLevel
);

// Get verified members for Sangh
router.get(
    '/verified-members',
    [
        query('level').isIn(['city', 'district', 'state', 'country']).withMessage('Invalid level'),
        query('city').optional().isString(),
        query('district').optional().isString(),
        query('state').optional().isString()
    ],
    getVerifiedMembers
);

// Edit Jain Aadhar application - for authorized reviewers
router.put(
    '/applications/:id/edit',
    [
        param('id').isMongoId().withMessage('Invalid application ID'),
        body('editRemarks').optional().isString().withMessage('Edit remarks must be a string')
    ],
    canEditJainAadhar,
    editJainAadhar
);

module.exports = router;