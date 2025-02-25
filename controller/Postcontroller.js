const Post = require('../model/postModel');
const User = require('../model/userModel');
const asyncHandler = require('express-async-handler');
const { body, validationResult, param, query } = require('express-validator');
const upload = require('../middlewares/upload');

// Create a post
const createPost = [
  upload.single('image'),
  body('caption').optional().isString().isLength({ max: 500 }).withMessage('Caption must be a string with a maximum length of 500 characters'),
  body('userId').notEmpty().isMongoId().withMessage('User ID is required and must be a valid Mongo ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { caption, userId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const media = [];
    if (req.file) {
      const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      media.push({
        url: req.file.location,
        type: fileType
      });
    }

    const post = await Post.create({ user: userId, caption, media });
    user.posts.push(post._id);
    await user.save();
    res.status(201).json(post);
  })
];

// Get posts by user
const getPostsByUser = [
  param('userId').notEmpty().isMongoId().withMessage('User ID is required and must be a valid Mongo ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const posts = await Post.find({ user: userId })
      .populate('user', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 });

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: 'No posts found for this user' });
    }

    res.json(posts);
  })
];

// Get post by ID
const getPostById = [
  param('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { postId } = req.params;
    const post = await Post.findById(postId)
      .populate('user', 'firstName lastName profilePicture')
      .populate({
        path: 'comments.user',
        select: 'firstName lastName profilePicture',
      })
      .populate({
        path: 'comments.replies.user',
        select: 'firstName lastName profilePicture',
      });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(post);
  })
];

// Get all posts
const getAllPosts = asyncHandler(async (req, res) => {
  const posts = await Post.find({})
    .populate('user', 'firstName lastName profilePicture')
    .sort({ createdAt: -1 });

  res.json(posts);
});

// Toggle like on a post
const toggleLike = [
  param('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID'),
  query('userId').notEmpty().isMongoId().withMessage('User ID is required and must be a valid Mongo ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { postId } = req.params;
    const { userId } = req.query;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const isLiked = post.likes.includes(userId);
    if (isLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();
    res.status(200).json({
      message: isLiked ? 'Like removed' : 'Post liked',
      likesCount: post.likes.length,
      likes: post.likes,
    });
  })
];

// Delete a post
const deletePost = [
  param('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID'),
  body('userId').notEmpty().isMongoId().withMessage('User ID is required and must be a valid Mongo ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { postId } = req.params;
    const { userId } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.user.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized to delete this post' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.posts = user.posts.filter((id) => id.toString() !== postId.toString());
    await user.save();
    await post.deleteOne();

    res.json({ message: 'Post deleted successfully' });
  })
];

// Edit a post
const editPost = [
  upload.single('image'),
  param('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID'),
  body('caption').optional().isString().isLength({ max: 500 }).withMessage('Caption must be a string with a maximum length of 500 characters'),
  body('userId').notEmpty().isMongoId().withMessage('User ID is required and must be a valid Mongo ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, caption } = req.body;
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.user.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    post.caption = caption;
    if (req.file) {
      const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      post.media.push({
        url: req.file.location,
        type: fileType
      });
    }
    await post.save();

    res.status(200).json({ message: 'Post updated successfully', post });
  })
];

// Add comment to a post
const addComment = [
  body('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID'),
  body('commentText').notEmpty().isString().withMessage('Comment text is required and must be a string'),
  body('userId').notEmpty().isMongoId().withMessage('User ID is required and must be a valid Mongo ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { postId, commentText, userId } = req.body;
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = {
      user: userId,
      text: commentText,
    };

    post.comments.push(comment);
    await post.save();
    await post.populate('comments.user', 'firstName lastName profilePicture');

    res.status(200).json({ message: 'Comment added successfully', post });
  })
];

// Add reply to a comment
const addReply = [
  body('commentId').notEmpty().isMongoId().withMessage('Comment ID is required and must be a valid Mongo ID'),
  body('userId').notEmpty().isMongoId().withMessage('User ID is required and must be a valid Mongo ID'),
  body('replyText').notEmpty().isString().withMessage('Reply text is required and must be a string'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { commentId, userId, replyText } = req.body;
    const post = await Post.findOne({ 'comments._id': commentId });
    if (!post) {
      return res.status(404).json({ message: 'Post or comment not found' });
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const newReply = {
      user: userId,
      text: replyText,
      createdAt: new Date(),
    };

    comment.replies.push(newReply);
    await post.save();
    await post.populate('comments.replies.user', 'firstName lastName profilePicture');

    res.status(201).json({ message: 'Reply added successfully', reply: newReply });
  })
];

// Get replies for a specific comment
const getReplies = [
  param('commentId').notEmpty().isMongoId().withMessage('Comment ID is required and must be a valid Mongo ID'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { commentId } = req.params;
    const post = await Post.findOne({ 'comments._id': commentId });
    if (!post) {
      return res.status(404).json({ message: 'Post or comment not found' });
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    await post.populate('comments.replies.user', 'firstName lastName profilePicture');
    res.status(200).json({ message: 'Replies fetched successfully', replies: comment.replies });
  })
];

module.exports = {
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
};