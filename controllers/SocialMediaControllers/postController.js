const Post = require('../../models/SocialMediaModels/postModel');
const User = require('../../models/UserRegistrationModels/userModel');
const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const upload = require('../../middlewares/uploadMiddleware');
const { postValidation } = require('../../validators/validations');
const Notification = require('../../models/SocialMediaModels/notificationModel');
const { getIo } = require('../../websocket/socket');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { s3Client, DeleteObjectCommand } = require('../../config/s3Config');
const { extractS3KeyFromUrl } = require('../../utils/s3Utils');

// Create a post
const createPost = [
  // Removing upload.postMediaUpload as it's already in the route
  ...postValidation.create,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { caption, userId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
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
    return successResponse(res, post, 'Post created successfully', 201);
  })
];

// Get posts by user
const getPostsByUser = [
  ...postValidation.getPostsByUser,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { userId } = req.params;
    const posts = await Post.find({ user: userId })
      .populate('user', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 });

    if (!posts || posts.length === 0) {
      return errorResponse(res, 'No posts found for this user', 404);
    }

    return successResponse(res, posts, 'Posts fetched successfully');
  })
];

// Get post by ID
const getPostById = [
  ...postValidation.getPostById,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
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
      return errorResponse(res, 'Post not found', 404);
    }

    return successResponse(res, post, 'Post fetched successfully');
  })
];

// Get all posts
const getAllPosts = asyncHandler(async (req, res) => {
  const posts = await Post.find({ isHidden: false })
    .populate('user', 'firstName lastName profilePicture')
    .sort({ createdAt: -1 });

  return successResponse(res, posts, 'Posts fetched successfully');
});

// Toggle like on a post
const toggleLike = [
  ...postValidation.toggleLike,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { postId } = req.params;
    const { userId } = req.query;

    const post = await Post.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    const isLiked = post.likes.includes(userId);
    if (isLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      post.likes.push(userId);

      // Send a like notification
      const notification = new Notification({
        senderId: userId,
        receiverId: post.user, 
        type: 'like',
        message: 'Someone liked your post.'
      });
      await notification.save();

      // Emit the notification event to the receiver
      const io = getIo();
      io.to(post.user.toString()).emit('newNotification', notification);
    }

    await post.save();
    return successResponse(res, { likesCount: post.likes.length, likes: post.likes }, isLiked ? 'Like removed' : 'Post liked', 200);
  })
];

// Delete a post
const deletePost = [
  ...postValidation.delete,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { postId } = req.params;
    const { userId } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    if (post.user.toString() !== userId.toString()) {
      return errorResponse(res, 'Unauthorized to delete this post', 403);
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Delete media files from S3 bucket
    if (post.media && post.media.length > 0) {
      const deletePromises = post.media.map(async (mediaItem) => {
        try {
          const key = extractS3KeyFromUrl(mediaItem.url);
          if (key) {
            const deleteParams = {
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: key
            };
            
            await s3Client.send(new DeleteObjectCommand(deleteParams));
            console.log(`Successfully deleted file from S3: ${key}`);
          }
        } catch (error) {
          console.error(`Error deleting file from S3: ${mediaItem.url}`, error);
          // Continue with post deletion even if S3 deletion fails
        }
      });
      
      // Wait for all S3 delete operations to complete
      await Promise.all(deletePromises);
    }

    user.posts = user.posts.filter((id) => id.toString() !== postId.toString());
    await user.save();
    await post.deleteOne();

    return successResponse(res, {}, 'Post deleted successfully');
  })
];

// Edit a post
const editPost = [
  upload.postMediaUpload,
  ...postValidation.edit,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { userId, caption } = req.body;
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    if (post.user.toString() !== userId.toString()) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    post.caption = caption;
    
    // If replaceMedia flag is set, delete existing media from S3 and replace with new ones
    if (req.body.replaceMedia === 'true' && post.media && post.media.length > 0) {
      // Delete existing media from S3
      const deletePromises = post.media.map(async (mediaItem) => {
        try {
          const key = extractS3KeyFromUrl(mediaItem.url);
          if (key) {
            const deleteParams = {
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: key
            };
            
            await s3Client.send(new DeleteObjectCommand(deleteParams));
            console.log(`Successfully deleted file from S3: ${key}`);
          }
        } catch (error) {
          console.error(`Error deleting file from S3: ${mediaItem.url}`, error);
        }
      });
      
      // Wait for all S3 delete operations to complete
      await Promise.all(deletePromises);
      
      // Clear existing media array
      post.media = [];
    }
    
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

    return successResponse(res, post, 'Post updated successfully', 200);
  })
];

// Add comment to a post
const addComment = [
  ...postValidation.comment,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { postId, commentText, userId } = req.body;
    const post = await Post.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
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

    return successResponse(res, post, 'Comment added successfully', 200);
  })
];

// Add reply to a comment
const addReply = [
  ...postValidation.reply,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { commentId, userId, replyText } = req.body;
    const post = await Post.findOne({ 'comments._id': commentId });
    if (!post) {
      return errorResponse(res, 'Post or comment not found', 404);
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      return errorResponse(res, 'Comment not found', 404);
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
    

    return successResponse(res, newReply, 'Reply added successfully', 201);
  })
];

// Get replies for a specific comment
const getReplies = [
  ...postValidation.getReplies,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { commentId } = req.params;
    const post = await Post.findOne({ 'comments._id': commentId });
    if (!post) {
      return errorResponse(res, 'Post or comment not found', 404);
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      return errorResponse(res, 'Comment not found', 404);
    }

    await post.populate('comments.replies.user', 'firstName lastName profilePicture');
    return successResponse(res, comment.replies, 'Replies fetched successfully', 200);
  })
];

// Delete a specific media item from a post
const deleteMediaItem = asyncHandler(async (req, res) => {
  const { postId, mediaId } = req.params;
  const { userId } = req.body;

  const post = await Post.findById(postId);
  if (!post) {
    return errorResponse(res, 'Post not found', 404);
  }

  if (post.user.toString() !== userId) {
    return errorResponse(res, 'Unauthorized to modify this post', 403);
  }

  // Find the media item in the post
  const mediaItem = post.media.id(mediaId);
  if (!mediaItem) {
    return errorResponse(res, 'Media item not found', 404);
  }

  // Delete from S3
  try {
    const key = extractS3KeyFromUrl(mediaItem.url);
    if (key) {
      const deleteParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key
      };
      
      await s3Client.send(new DeleteObjectCommand(deleteParams));
      console.log(`Successfully deleted file from S3: ${key}`);
    }
  } catch (error) {
    console.error(`Error deleting file from S3: ${mediaItem.url}`, error);
    return errorResponse(res, 'Error deleting media from storage', 500);
  }

  // Remove the media item from the post
  post.media.pull(mediaId);
  await post.save();

  return successResponse(res, post, 'Media item deleted successfully');
});

// Hide a post (make it invisible to others)
const hidePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.body;

  const post = await Post.findById(postId);
  if (!post) {
    return errorResponse(res, 'Post not found', 404);
  }

  if (post.user.toString() !== userId) {
    return errorResponse(res, 'Unauthorized to modify this post', 403);
  }

  post.isHidden = true;
  await post.save();

  return successResponse(res, post, 'Post hidden successfully');
});

// Unhide a post (make it visible again)
const unhidePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.body;

  const post = await Post.findById(postId);
  if (!post) {
    return errorResponse(res, 'Post not found', 404);
  }

  if (post.user.toString() !== userId) {
    return errorResponse(res, 'Unauthorized to modify this post', 403);
  }

  post.isHidden = false;
  await post.save();

  return successResponse(res, post, 'Post unhidden successfully');
});

// Get combined feed of user posts and Sangh posts
const getCombinedFeed = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get regular user posts
    const userPosts = await Post.find({ isHidden: false })
      .populate('user', 'firstName lastName fullName profilePicture')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);
    
    // Get Sangh posts
    const SanghPost = require('../../models/SanghModels/sanghPostModel');
    const sanghPosts = await SanghPost.find({ isHidden: false })
      .populate('sanghId', 'name level location')
      .populate('postedByUserId', 'firstName lastName fullName profilePicture')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);
    
    // Get Panch posts
    const PanchPost = require('../../models/SanghModels/panchPostModel');
    const panchPosts = await PanchPost.find({ isHidden: false })
      .populate('panchId', 'accessId')
      .populate('sanghId', 'name level location')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);
    
    // Add post type for frontend differentiation
    const userPostsWithType = userPosts.map(post => ({
      ...post.toObject(),
      postType: 'user'
    }));
    
    const sanghPostsWithType = sanghPosts.map(post => ({
      ...post.toObject(),
      postType: 'sangh'
    }));
    
    const panchPostsWithType = panchPosts.map(post => ({
      ...post.toObject(),
      postType: 'panch'
    }));
    
    // Combine and sort by creation date
    const combinedPosts = [...userPostsWithType, ...sanghPostsWithType, ...panchPostsWithType].sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    ).slice(0, limit);
    
    // Get total counts for pagination
    const totalUserPosts = await Post.countDocuments({ isHidden: false });
    const totalSanghPosts = await SanghPost.countDocuments({ isHidden: false });
    const totalPanchPosts = await PanchPost.countDocuments({ isHidden: false });
    const totalPosts = totalUserPosts + totalSanghPosts + totalPanchPosts;
    
    return successResponse(res, {
      posts: combinedPosts,
      pagination: {
        total: totalPosts,
        page,
        pages: Math.ceil(totalPosts / limit)
      }
    }, 'Combined feed retrieved successfully');
  } catch (error) {
    return errorResponse(res, 'Error retrieving combined feed', 500, error.message);
  }
});

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
  getReplies,
  hidePost,
  unhidePost,
  deleteMediaItem,
  getCombinedFeed
};