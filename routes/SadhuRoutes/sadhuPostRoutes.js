const express = require('express');
const router = express.Router();
const { 
    createSadhuPost,
    getSadhuPosts,
    getSadhuPostById,
    updateSadhuPost,
    toggleLikeSadhuPost,
    commentOnSadhuPost,
    deleteSadhuPost,
    deleteSadhuComment,
    addSadhuReply,
    getSadhuReplies,
    deleteSadhuReply,
    deleteSadhuMedia,
    toggleHideSadhuPost
} = require('../../controllers/SadhuControllers/sadhuPostController');
const { authMiddleware, verifySadhuRole } = require('../../middlewares/authMiddlewares');
const { canManageSadhuPost } = require('../../middlewares/sadhuAuthMiddleware');
const { postMediaUpload } = require('../../middlewares/uploadMiddleware');

// Public routes

router.get('/:sadhuId/posts', getSadhuPosts);
router.get('/posts/:postId', getSadhuPostById);

// Protected routes - require user auth
router.use(authMiddleware);

// Like and comment routes
router.post('/posts/:postId/like', toggleLikeSadhuPost);
router.post('/posts/:postId/comment', commentOnSadhuPost);
router.delete('/posts/:postId/comments/:commentId', deleteSadhuComment);

// New routes for comment replies
router.post('/posts/:postId/comments/:commentId/reply', addSadhuReply);
router.get('/posts/:postId/comments/:commentId/replies', getSadhuReplies);
router.delete('/posts/:postId/comments/:commentId/replies/:replyId', deleteSadhuReply);

// Sadhu post management routes - require sadhu role
router.post(
    '/:sadhuId/posts',
    verifySadhuRole,
    postMediaUpload,
    createSadhuPost
);

router.put(
    '/posts/:postId',
    canManageSadhuPost,
    postMediaUpload,
    updateSadhuPost
);

router.delete(
    '/posts/:postId',
    canManageSadhuPost,
    deleteSadhuPost
);

// Media management route
router.delete('/posts/media', canManageSadhuPost, deleteSadhuMedia);

// Post visibility route
router.put('/posts/:postId/visibility', canManageSadhuPost, toggleHideSadhuPost);

module.exports = router;
