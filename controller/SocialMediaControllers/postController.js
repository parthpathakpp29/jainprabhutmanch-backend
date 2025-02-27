const Post = require('../../model/SocialMediaModels/postModel');
const User = require('../../model/UserRegistrationModels/userModel');
const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const upload = require('../../middlewares/uploadMiddleware');
const { postValidation } = require('../../validators/validations');
const Notification = require('../../model/SocialMediaModels/notificationModel');
const { getIo } = require('../../websocket/socket');

// Create a post
const createPost = [
  upload.postMediaUpload,
  ...postValidation.create,
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
    if (req.files) {
      if (req.files.image) {
        req.files.image.forEach(file => {
          media.push({
            url: file.location,
            type: 'image'
          });
        });
      }
      if (req.files.video) {
        req.files.video.forEach(file => {
          media.push({
            url: file.location,
            type: 'video'
          });
        });
      }
    }

    const post = await Post.create({ user: userId, caption, media });
    user.posts.push(post._id);
    await user.save();
    res.status(201).json(post);
  })
];

// Get posts by user
const getPostsByUser = [
  ...postValidation.getPostsByUser,
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
  ...postValidation.getPostById,
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
  ...postValidation.toggleLike,
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

      // Send a like notification
      const notification = new Notification({
        senderId: userId,
        receiverId: post.user, // Fixed: use post.user instead of receiverId
        type: 'like',
        message: 'Someone liked your post.'
      });
      await notification.save();

      // Emit the notification event to the receiver
      const io = getIo();
      io.to(post.user.toString()).emit('newNotification', notification);
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
  ...postValidation.delete,
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
  upload.postMediaUpload,
  ...postValidation.edit,
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
    if (req.files) {
      if (req.files.image) {
        req.files.image.forEach(file => {
          post.media.push({
            url: file.location,
            type: 'image'
          });
        });
      }
      if (req.files.video) {
        req.files.video.forEach(file => {
          post.media.push({
            url: file.location,
            type: 'video'
          });
        });
      }
    }
    await post.save();

    res.status(200).json({ message: 'Post updated successfully', post });
  })
];

// Add comment to a post
const addComment = [
  ...postValidation.comment,
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

    // Send a comment notification
    const notification = new Notification({
      senderId: userId,
      receiverId: post.user,
      type: 'comment',
      message: 'Someone commented on your post.'
    });
    await notification.save();

    // Emit the notification event to the receiver
    const io = getIo();
    io.to(post.user.toString()).emit('newNotification', notification);

    res.status(200).json({ message: 'Comment added successfully', post });
  })
];

// Add reply to a comment
const addReply = [
  ...postValidation.reply,
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

    // Send a reply notification
    const notification = new Notification({
      senderId: userId,
      receiverId: comment.user,
      type: 'reply',
      message: 'Someone replied to your comment.'
    });
    await notification.save();

    // Emit the notification event to the receiver
    const io = getIo();
    io.to(comment.user.toString()).emit('newNotification', notification);
    

    res.status(201).json({ message: 'Reply added successfully', reply: newReply });
  })
];

// Get replies for a specific comment
const getReplies = [
  ...postValidation.getReplies,
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