const express = require('express');
const router = express.Router();
const { 
  createJainAadhar,
  getApplicationStatus,
  getAllApplications,
  reviewApplication,
  getApplicationStats,
  getApplicationDetails,
  addReviewComment
} = require('../controller/jainAdharController');
const { authMiddleware, isAdmin } = require('../middlewares/authMiddlewares');
const upload = require('../middlewares/upload');
const rateLimit = require('express-rate-limit');

// Rate limiting for application submission
// const applicationLimiter = rateLimit({
//   windowMs: 24 * 60 * 60 * 1000, // 24 hours
//   max: 1, // limit each IP to 1 application per day
//   message: {
//     success: false,
//     message: 'Too many applications. Please try again tomorrow.'
//   }
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
  createJainAadhar
);

router.get(
  '/status',
  statusCheckLimiter,
  getApplicationStatus
);

// Admin routes (require admin privileges)
router.use(isAdmin);

// Admin application management
router.get(
  '/applications',
  getAllApplications
);

router.get(
  '/applications/stats',
  getApplicationStats
);

router.get(
  '/applications/:id',
  getApplicationDetails
);

// Admin review actions
router.put(
  '/applications/:id/review',
  reviewApplication
);

router.post(
  '/applications/:id/comment',
  addReviewComment
);

module.exports = router;
