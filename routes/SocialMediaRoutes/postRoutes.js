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
  getReplies
} = require('../../controller/SocialMediaControllers/postController');

const router = express.Router();

router.post('/create', createPost); // Create a post
router.get('/', getAllPosts); // Get all posts
router.put('/:postId/like', toggleLike); // Like a post
router.delete('/:postId', deletePost); // Delete a post
router.put('/:postId', editPost); // Edit a post
router.get('/user/:userId', getPostsByUser); // Get posts by user
router.get('/:postId', getPostById); // Get post by ID
router.post('/comment', addComment); // Add comment to post
router.post('/comment/reply', addReply); // Add reply to comment
router.get('/comments/:commentId/replies', getReplies); // Get replies for a comment

module.exports = router;