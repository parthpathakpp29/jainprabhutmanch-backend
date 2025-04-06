const express = require('express');
const router = express.Router();
const { 
  createSanghPost, 
  getSanghPosts, 
  getAllSanghPosts,
  getSanghPostById, // Add this import
  toggleLikeSanghPost,
  addCommentToSanghPost,
  deleteSanghPost,
  updateSanghPost,
  addReplyToComment,
  getRepliesForSanghPost,
  deleteMediaItemFromSanghPost,
  hideSanghPost,
  unhideSanghPost,
} = require('../../controllers/SanghControllers/sanghPostController');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const { canPostAsSangh } = require('../../middlewares/sanghPermissions');
const upload = require('../../middlewares/uploadMiddleware');
const { body, param } = require('express-validator');

// Protected routes
router.use(authMiddleware);

// Create post as Sangh (only office bearers)
router.post(
  '/:sanghId/posts',
  canPostAsSangh,
  upload.fields([{ name: 'media', maxCount: 10 }]),
  [
    body('content').notEmpty().withMessage('Content is required')
      .isLength({ max: 2000 }).withMessage('Content cannot exceed 2000 characters')
  ],
  createSanghPost
);

// Get Sangh posts (public)
router.get(
  '/:sanghId/posts',
  [
    param('sanghId').isMongoId().withMessage('Invalid Sangh ID')
  ],
  getSanghPosts
);

// Get all Sangh posts for social feed (public)
router.get(
  '/posts/feed',
  getAllSanghPosts
);

// Get single Sangh post by ID (public)
router.get(
  '/posts/:postId',
  [
    param('postId').isMongoId().withMessage('Invalid post ID')
  ],
  getSanghPostById
);


// Like/unlike a Sangh post
router.put(
  '/posts/:postId/like',
  [
    param('postId').isMongoId().withMessage('Invalid post ID')
  ],
  toggleLikeSanghPost
);

// Add comment to a post
router.post(
  '/posts/:postId/comments',
  [
    param('postId').isMongoId().withMessage('Invalid post ID'),
    body('text').notEmpty().withMessage('Comment text is required')
      .isLength({ max: 500 }).withMessage('Comment cannot exceed 500 characters')
  ],
  addCommentToSanghPost
);

// Add reply to a comment
router.post(
  '/posts/:postId/comments/:commentId/replies',
  [
    param('postId').isMongoId().withMessage('Invalid post ID'),
    param('commentId').isMongoId().withMessage('Invalid comment ID'),
    body('text').notEmpty().withMessage('Reply text is required')
      .isLength({ max: 500 }).withMessage('Reply cannot exceed 500 characters')
  ],
  addReplyToComment
);

// Get replies for a comment
router.get(
  '/posts/:postId/comments/:commentId/replies',
  [
    param('postId').isMongoId().withMessage('Invalid post ID'),
    param('commentId').isMongoId().withMessage('Invalid comment ID')
  ],
  getRepliesForSanghPost
);

// Delete a Sangh post
router.delete(
  '/posts/:postId',
  [
    param('postId').isMongoId().withMessage('Invalid post ID')
  ],
  deleteSanghPost
);

// Update a Sangh post
router.put(
  '/posts/:postId',
  canPostAsSangh,
  upload.fields([{ name: 'media', maxCount: 10 }]),
  [
    param('postId').isMongoId().withMessage('Invalid post ID'),
    body('content').notEmpty().withMessage('Content is required')
      .isLength({ max: 2000 }).withMessage('Content cannot exceed 2000 characters')
  ],
  updateSanghPost
);

// Delete a specific media item from a post
router.delete(
  '/posts/:postId/media/:mediaId',
  [
    param('postId').isMongoId().withMessage('Invalid post ID'),
    param('mediaId').isMongoId().withMessage('Invalid media ID')
  ],
  deleteMediaItemFromSanghPost
);

// Hide/unhide post routes
router.put(
  '/posts/:postId/hide',
  [
    param('postId').isMongoId().withMessage('Invalid post ID')
  ],
  hideSanghPost
);

router.put(
  '/posts/:postId/unhide',
  [
    param('postId').isMongoId().withMessage('Invalid post ID')
  ],
  unhideSanghPost
);

module.exports = router;