const SanghPost = require('../../models/SanghModels/sanghPostModel');
const HierarchicalSangh = require('../../models/SanghModels/hierarchicalSanghModel');
const asyncHandler = require('express-async-handler');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { s3Client, DeleteObjectCommand } = require('../../config/s3Config');
const { extractS3KeyFromUrl } = require('../../utils/s3Utils');
const Notification = require('../../models/SocialMediaModels/notificationModel');
const { getIo } = require('../../websocket/socket');
const { validationResult } = require('express-validator');

// Create a post as Sangh
const createSanghPost = asyncHandler(async (req, res) => {
  try {
    const sanghId = req.params.sanghId;
    const userId = req.user._id;
    const officeBearerRole = req.officeBearerRole;
    const { caption } = req.body;
    
    // Validate caption
    if (!caption) {
      return errorResponse(res, 'Caption is required', 400);
    }
    
    // Process uploaded media
    let mediaFiles = [];
    if (req.files && req.files.media) {
      mediaFiles = req.files.media.map(file => ({
        url: file.location,
        type: file.mimetype.startsWith('image/') ? 'image' : 'video'
      }));
    }
    
    // Get sanghType from the Sangh
    const sangh = await HierarchicalSangh.findById(sanghId);
    if (!sangh) {
      return errorResponse(res, 'Sangh not found', 404);
    }
    const sanghType = sangh.sanghType;

    // Create the post
    const post = await SanghPost.create({
      sanghId,
      sanghType,
      postedByUserId: userId,
      postedByRole: officeBearerRole,
      caption,
      media: mediaFiles
    });
    
    // Populate Sangh and user details for response
    const populatedPost = await SanghPost.findById(post._id)
      .populate('sanghId', 'name level location')
      .populate('postedByUserId', 'firstName lastName fullName profilePicture');
    
    return successResponse(res, populatedPost, 'Post created successfully', 201);
  } catch (error) {
    // If there's an error, clean up any uploaded files
    if (req.files && req.files.media) {
      const deletePromises = req.files.media.map(async (file) => {
        try {
          const key = extractS3KeyFromUrl(file.location);
          if (key) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: key
            }));
            console.log(`Successfully deleted file from S3: ${key}`);
          }
        } catch (err) {
          console.error(`Error deleting file from S3: ${file.location}`, err);
        }
      });
      await Promise.all(deletePromises);
    }
    return errorResponse(res, error.message, 500);
  }
});

// Get posts by Sangh ID
const getSanghPosts = asyncHandler(async (req, res) => {
  try {
    const { sanghId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Run queries in parallel using Promise.all
    const [posts, total] = await Promise.all([
      SanghPost.find({ 
        sanghId,
        isHidden: false 
      })
        .select('caption media postedByUserId postedByRole createdAt likes comments') // Select only needed fields
        .populate('sanghId', 'name level location')
        .populate('postedByUserId', 'firstName lastName fullName profilePicture')
        .populate('comments.user', 'firstName lastName fullName profilePicture')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean(), // Convert to plain JS objects for better performance

      SanghPost.countDocuments({ 
        sanghId,
        isHidden: false 
      })
    ]);
    
    return successResponse(res, {
      posts,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    }, 'Sangh posts retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Get all Sangh posts for social feed
const getAllSanghPosts = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get all visible Sangh posts
    const posts = await SanghPost.find({ isHidden: false })
      .populate('sanghId', 'name level location')
      .populate('postedByUserId', 'firstName lastName fullName profilePicture')
      .populate('comments.user', 'firstName lastName fullName profilePicture')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);
    
    const total = await SanghPost.countDocuments({ isHidden: false });
    
    return successResponse(res, {
      posts,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    }, 'All Sangh posts retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Toggle like on a Sangh post
const toggleLikeSanghPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    
    const post = await SanghPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }
    
    const result = post.toggleLike(userId);
    await post.save();
    
    return successResponse(res, result, `Post ${result.isLiked ? 'liked' : 'unliked'} successfully`);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Add comment to a Sangh post
const commentOnSanghPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;
    
    if (!text) {
      return errorResponse(res, 'Comment text is required', 400);
    }
    
    const post = await SanghPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }
    
    const comment = post.addComment(userId, text);
    await post.save();
    
    // Populate user details in the comment
    const populatedPost = await SanghPost.findById(postId)
      .populate('comments.user', 'firstName lastName fullName profilePicture');
    
    const populatedComment = populatedPost.comments.id(comment._id);
    
    return successResponse(res, populatedComment, 'Comment added successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Delete a Sangh post (only by the creator or superadmin)
const deleteSanghPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    
    const post = await SanghPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }
    
    // Check if user is authorized to delete
    if (post.postedByUserId.toString() !== userId.toString() && req.user.role !== 'superadmin') {
      return errorResponse(res, 'Not authorized to delete this post', 403);
    }
    
    // Delete media files from S3
    if (post.media && post.media.length > 0) {
      const deletePromises = post.media.map(async (mediaItem) => {
        try {
          const key = extractS3KeyFromUrl(mediaItem.url);
          if (key) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: key
            }));
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
    
    await post.deleteOne();
    
    return successResponse(res, null, 'Post deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Update Sangh post
const updateSanghPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const { caption } = req.body;
    const userId = req.user._id;

    const post = await SanghPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // Check authorization
    if (post.postedByUserId.toString() !== userId.toString() && req.user.role !== 'superadmin') {
      return errorResponse(res, 'Not authorized to update this post', 403);
    }

    // If replaceMedia flag is set, delete existing media from S3
    if (req.body.replaceMedia === 'true' && post.media && post.media.length > 0) {
      const deletePromises = post.media.map(async (mediaItem) => {
        try {
          const key = extractS3KeyFromUrl(mediaItem.url);
          if (key) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: key
            }));
            console.log(`Successfully deleted file from S3: ${key}`);
          }
        } catch (error) {
          console.error(`Error deleting file from S3: ${mediaItem.url}`, error);
        }
      });
      
      await Promise.all(deletePromises);
      post.media = [];
    }

    // Add new media if provided
    if (req.files && req.files.media) {
      const newMedia = req.files.media.map(file => ({
        url: file.location,
        type: file.mimetype.startsWith('image/') ? 'image' : 'video'
      }));
      post.media.push(...newMedia);
    }

    // Update caption
    post.caption = caption;
    await post.save();

    const updatedPost = await SanghPost.findById(postId)
      .populate('sanghId', 'name level location')
      .populate('postedByUserId', 'firstName lastName fullName profilePicture');

    return successResponse(res, updatedPost, 'Post updated successfully');
  } catch (error) {
    // If there's an error and new files were uploaded, clean them up
    if (req.files && req.files.media) {
      const deletePromises = req.files.media.map(async (file) => {
        try {
          const key = extractS3KeyFromUrl(file.location);
          if (key) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: key
            }));
          }
        } catch (err) {
          console.error(`Error deleting file from S3: ${file.location}`, err);
        }
      });
      await Promise.all(deletePromises);
    }
    return errorResponse(res, error.message, 500);
  }
});

// Add reply to a comment
const addReplyToSanghPost = asyncHandler(async (req, res) => {
  try {
    const { commentId, replyText } = req.body;
    const userId = req.user._id;
    
    if (!replyText) {
      return errorResponse(res, 'Reply text is required', 400);
    }
    
    const post = await SanghPost.findOne({ 'comments._id': commentId });
    if (!post) {
      return errorResponse(res, 'Post or comment not found', 404);
    }
    
    const comment = post.comments.id(commentId);
    if (!comment) {
      return errorResponse(res, 'Comment not found', 404);
    }
    
    // Initialize replies array if it doesn't exist
    if (!comment.replies) {
      comment.replies = [];
    }
    
    const newReply = {
      user: userId,
      text: replyText,
      createdAt: new Date()
    };
    
    comment.replies.push(newReply);
    await post.save();
    
    // Populate user details
    await post.populate('comments.replies.user', 'firstName lastName fullName profilePicture');
    const populatedReply = comment.replies[comment.replies.length - 1];
    
    // Send notification
    try {
      const notification = new Notification({
        senderId: userId,
        receiverId: comment.user,
        type: 'reply',
        message: 'Someone replied to your comment on a Sangh post.'
      });
      await notification.save();
      
      // Emit notification event
      const io = getIo();
      if (io) {
        io.to(comment.user.toString()).emit('newNotification', notification);
      }
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
      // Continue execution even if notification fails
    }
    
    return successResponse(res, populatedReply, 'Reply added successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Get replies for a specific comment
const getRepliesForSanghPost = asyncHandler(async (req, res) => {
  try {
    const { commentId } = req.params;
    
    const post = await SanghPost.findOne({ 'comments._id': commentId });
    if (!post) {
      return errorResponse(res, 'Post or comment not found', 404);
    }
    
    const comment = post.comments.id(commentId);
    if (!comment) {
      return errorResponse(res, 'Comment not found', 404);
    }
    
    await post.populate('comments.replies.user', 'firstName lastName fullName profilePicture');
    const replies = comment.replies || [];
    
    return successResponse(res, replies, 'Replies fetched successfully', 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Delete a specific media item from a post
const deleteMediaItemFromSanghPost = asyncHandler(async (req, res) => {
  try {
    const { postId, mediaId } = req.params;
    const userId = req.user._id;
    
    const post = await SanghPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }
    
    // Check authorization
    if (post.postedByUserId.toString() !== userId.toString() && req.user.role !== 'superadmin') {
      return errorResponse(res, 'Not authorized to modify this post', 403);
    }
    
    // Find the media item
    const mediaItem = post.media.id(mediaId);
    if (!mediaItem) {
      return errorResponse(res, 'Media item not found', 404);
    }
    
    // Delete from S3
    try {
      const key = extractS3KeyFromUrl(mediaItem.url);
      if (key) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: key
        }));
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
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Hide a Sangh post
const hideSanghPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    
    const post = await SanghPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }
    
    // Check authorization
    if (post.postedByUserId.toString() !== userId.toString() && req.user.role !== 'superadmin') {
      return errorResponse(res, 'Not authorized to modify this post', 403);
    }
    
    post.isHidden = true;
    await post.save();
    
    return successResponse(res, post, 'Post hidden successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Unhide a Sangh post
const unhideSanghPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    
    const post = await SanghPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }
    
    // Check authorization
    if (post.postedByUserId.toString() !== userId.toString() && req.user.role !== 'superadmin') {
      return errorResponse(res, 'Not authorized to modify this post', 403);
    }
    
    post.isHidden = false;
    await post.save();
    
    return successResponse(res, post, 'Post unhidden successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

module.exports = {
  createSanghPost,
  getSanghPosts,
  getAllSanghPosts,
  toggleLikeSanghPost,
  commentOnSanghPost,
  deleteSanghPost,
  updateSanghPost,
  addReplyToSanghPost,
  getRepliesForSanghPost,
  deleteMediaItemFromSanghPost,
  hideSanghPost,
  unhideSanghPost
};