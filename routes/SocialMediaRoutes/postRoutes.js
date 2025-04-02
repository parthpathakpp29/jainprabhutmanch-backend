const express = require('express');
const {
  createPost,
  getAllPosts,
  toggleLike,
  deletePost,
  editPost,
  getPostsByUser,
  getPostById,
  addComment,
  addReply,
  getReplies,
  hidePost,
  unhidePost,
  deleteMediaItem,
  getCombinedFeed,
  getCombinedFeedOptimized
} = require('../../controllers/SocialMediaControllers/postController');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const { check, param } = require('express-validator');
const rateLimit = require('express-rate-limit');
const upload = require('../../middlewares/uploadMiddleware');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Rate limiting for post creation
const postCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each user to 5 posts per 15 minutes
  message: {
    success: false,
    message: 'Too many posts created. Please try again later.'
  },
  standardHeaders: true,
  keyGenerator: (req) => req.user ? req.user.id : req.ip // Use user ID if available
});

// Post CRUD operations
router.post('/create', 
  postCreationLimiter, 
  upload.postMediaUpload,  
  [
    check('caption').optional().isLength({ max: 2000 }).withMessage('Caption cannot exceed 2000 characters')
  ], 
  createPost
);

router.get('/', getAllPosts);

// Get combined feed of user posts and Sangh posts
router.get('/combined-feed', getCombinedFeed);

// Get optimized combined feed with cursor-based pagination
router.get('/combined-feed-optimized', getCombinedFeedOptimized);

router.get('/:postId', [
  param('postId').isMongoId().withMessage('Invalid post ID')
], getPostById);

router.put('/:postId', [
  param('postId').isMongoId().withMessage('Invalid post ID'),
  check('caption').optional().isLength({ max: 2000 }).withMessage('Caption cannot exceed 2000 characters')
], editPost);

router.delete('/:postId', [
  param('postId').isMongoId().withMessage('Invalid post ID')
], deletePost);

// Delete a specific media item from a post
router.delete('/:postId/media/:mediaId', [
  param('postId').isMongoId().withMessage('Invalid post ID'),
  param('mediaId').isMongoId().withMessage('Invalid media ID')
], deleteMediaItem);

// User-specific post routes
router.get('/user/:userId', [
  param('userId').isMongoId().withMessage('Invalid user ID')
], getPostsByUser);

// Interaction routes
router.put('/:postId/like', [
  param('postId').isMongoId().withMessage('Invalid post ID')
], toggleLike);

router.post('/comment', [
  check('postId').isMongoId().withMessage('Invalid post ID'),
  check('commentText').notEmpty().withMessage('Comment text is required').isLength({ max: 500 }).withMessage('Comment cannot exceed 500 characters')
], addComment);

router.post('/comment/reply', [
  check('commentId').isMongoId().withMessage('Invalid comment ID'),
  check('replyText').notEmpty().withMessage('Reply text is required').isLength({ max: 500 }).withMessage('Reply cannot exceed 500 characters')
], addReply);

router.get('/comments/:commentId/replies', [
  param('commentId').isMongoId().withMessage('Invalid comment ID')
], getReplies);

// Visibility routes
router.put('/:postId/hide', [
  param('postId').isMongoId().withMessage('Invalid post ID')
], hidePost);

router.put('/:postId/unhide', [
  param('postId').isMongoId().withMessage('Invalid post ID')
], unhidePost);

module.exports = router;