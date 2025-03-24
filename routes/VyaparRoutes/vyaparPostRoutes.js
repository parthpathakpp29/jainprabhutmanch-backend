const express = require('express');
const router = express.Router();
const {
    createPost,
    getPosts,
    getPostById,
    updatePost,
    deletePost,
    toggleLike,
    addComment,
    deleteComment,
    addReply,
    getReplies,
    deleteReply,
    deleteMedia,
    toggleHidePost
} = require('../../controllers/VyaparControllers/vyaparPostController');
const { postMediaUpload } = require('../../middlewares/uploadMiddleware');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const { canManageBusinessPost } = require('../../middlewares/vyaparAuthMiddleware');

// Public routes
router.get('/:vyaparId/posts', getPosts);
router.get('/posts/:postId', getPostById);

// Protected routes - require user authentication
router.use(authMiddleware);

// Business owner routes - require business credentials
router.post('/:vyaparId/posts',
    canManageBusinessPost,
    postMediaUpload,
    createPost
);

router.put('/:postId',
    canManageBusinessPost,
    postMediaUpload,
    updatePost
);

router.delete('/:postId',
    canManageBusinessPost,
    deletePost
);

// Social interaction routes
router.post('/:postId/like', toggleLike);
router.post('/:postId/comment', addComment);
router.delete('/:postId/comments/:commentId', deleteComment);

// New routes for standardized functionality
// Reply routes
router.post('/:postId/comments/:commentId/reply', addReply);
router.get('/:postId/comments/:commentId/replies', getReplies);
router.delete('/:postId/comments/:commentId/replies/:replyId', deleteReply);

// Media management route
router.delete('/media', deleteMedia);

// Hide/Unhide post route
router.put('/:postId/visibility', toggleHidePost);

module.exports = router;
