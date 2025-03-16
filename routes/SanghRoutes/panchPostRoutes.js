const express = require('express');
const router = express.Router();
const { 
  createPanchPost, 
  getPanchPosts, 
  getAllPanchPosts,
  toggleLikePanchPost,
  commentOnPanchPost,
  deletePanchPost,
  getPanchMemberAccessKey
} = require('../../controllers/SanghControllers/panchPostController');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const { isPanchMember } = require('../../middlewares/sanghPermissions');
const upload = require('../../middlewares/uploadMiddleware');
const { body, param } = require('express-validator');

// Protected routes
router.use(authMiddleware);

// Get Panch member access key
router.post(
  '/access-key',
  [
    body('panchId').isMongoId().withMessage('Invalid Panch ID'),
    body('jainAadharNumber').notEmpty().withMessage('Jain Aadhar number is required')
  ],
  getPanchMemberAccessKey
);

// Create post as Panch member
router.post(
  '/posts',
  upload.fields([{ name: 'media', maxCount: 10 }]),
  isPanchMember,
  [
    body('content').notEmpty().withMessage('Content is required')
      .isLength({ max: 2000 }).withMessage('Content cannot exceed 2000 characters'),
    body('panchId').isMongoId().withMessage('Invalid Panch ID'),
    body('accessKey').notEmpty().withMessage('Access key is required')
  ],
  createPanchPost
);

// Get Panch posts (public)
router.get(
  '/:panchId/posts',
  [
    param('panchId').isMongoId().withMessage('Invalid Panch ID')
  ],
  getPanchPosts
);

// Get all Panch posts for social feed (public)
router.get(
  '/posts/feed',
  getAllPanchPosts
);

// Like/unlike a Panch post
router.put(
  '/posts/:postId/like',
  [
    param('postId').isMongoId().withMessage('Invalid post ID')
  ],
  toggleLikePanchPost
);

// Comment on a Panch post
router.post(
  '/posts/:postId/comment',
  [
    param('postId').isMongoId().withMessage('Invalid post ID'),
    body('text').notEmpty().withMessage('Comment text is required')
      .isLength({ max: 500 }).withMessage('Comment cannot exceed 500 characters')
  ],
  commentOnPanchPost
);

// Delete a Panch post
router.delete(
  '/posts/:postId',
  isPanchMember,
  [
    param('postId').isMongoId().withMessage('Invalid post ID'),
    body('panchId').isMongoId().withMessage('Invalid Panch ID'),
    body('accessKey').notEmpty().withMessage('Access key is required')
  ],
  deletePanchPost
);

module.exports = router;