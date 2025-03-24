const express = require('express');
const router = express.Router();
const { 
  createPanchPost, 
  getPanchPosts, 
  getAllPanchPosts,
  toggleLikePanchPost,
  commentOnPanchPost,
  deletePanchPost,
  updatePanchPost,

  addReplyToPanchPost,
  getRepliesForPanchPost,
  deleteMediaItemFromPanchPost,
  hidePanchPost,
  unhidePanchPost
} = require('../../controllers/SanghControllers/panchPostController');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const { isPanchMember } = require('../../middlewares/sanghPermissions');
const upload = require('../../middlewares/uploadMiddleware');
const { body, param } = require('express-validator');

// Protected routes
router.use(authMiddleware);

// Create post as Panch member (only active members)
router.post(
  '/:panchId/posts',
  isPanchMember,
  upload.fields([{ name: 'media', maxCount: 10 }]),
  [
    body('caption').notEmpty().withMessage('Caption is required')
      .isLength({ max: 2000 }).withMessage('Caption cannot exceed 2000 characters')
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

// Reply to a comment
router.post(
  '/comments/reply',
  [
    body('commentId').isMongoId().withMessage('Invalid comment ID'),
    body('replyText').notEmpty().withMessage('Reply text is required')
      .isLength({ max: 500 }).withMessage('Reply cannot exceed 500 characters')
  ],
  addReplyToPanchPost
);

// Get replies for a comment
router.get(
  '/comments/:commentId/replies',
  [
    param('commentId').isMongoId().withMessage('Invalid comment ID')
  ],
  getRepliesForPanchPost
);

// Delete a Panch post
router.delete(
  '/posts/:postId',
 isPanchMember,
  [
    param('postId').isMongoId().withMessage('Invalid post ID')
  ],
  deletePanchPost
);

// Update a Panch post
router.put(
  '/posts/:postId',
  isPanchMember,
  upload.fields([{ name: 'media', maxCount: 10 }]),
  [
    param('postId').isMongoId().withMessage('Invalid post ID'),
    body('caption').notEmpty().withMessage('Caption is required')
      .isLength({ max: 2000 }).withMessage('Caption cannot exceed 2000 characters')
  ],
  updatePanchPost
);

// Delete a specific media item from a post
router.delete(
  '/posts/:postId/media/:mediaId',
  isPanchMember,
  [
    param('postId').isMongoId().withMessage('Invalid post ID'),
    param('mediaId').isMongoId().withMessage('Invalid media ID')
  ],
  deleteMediaItemFromPanchPost
);

// Hide/unhide post routes
router.put(
  '/posts/:postId/hide',
  isPanchMember,
  [
    param('postId').isMongoId().withMessage('Invalid post ID')
  ],
  hidePanchPost
);

router.put(
  '/posts/:postId/unhide',
  isPanchMember,
  [
    param('postId').isMongoId().withMessage('Invalid post ID')
  ],
  unhidePanchPost
);


module.exports = router;