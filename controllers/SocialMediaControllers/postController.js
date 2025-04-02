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
const { createLikeNotification, createCommentNotification, createReplyNotification } = require('../../utils/notificationUtils');

const SanghPost = require('../../models/SanghModels/sanghPostModel');
const PanchPost = require('../../models/SanghModels/panchPostModel');
const VyaparPost = require('../../models/VyaparModels/vyaparPostModel');
const TirthPost = require('../../models/TirthModels/tirthPostModel');
const SadhuPost = require('../../models/SadhuModels/sadhuPostModel');

// Create a post
const createPost = [
  
  ...postValidation.create,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { caption } = req.body;
    const userId = req.user._id;
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
  asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user._id; // Get user ID from auth token

    const post = await Post.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    const isLiked = post.likes.includes(userId);
    if (isLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== userId.toString());
    } else {
      post.likes.push(userId);

      // Create notification if the post was liked (not unliked)
      if (post.user.toString() !== userId.toString()) {
        await createLikeNotification({
          senderId: userId,
          receiverId: post.user,
          entityId: postId,
          entityType: 'Post',
          senderName: `${req.user.firstName} ${req.user.lastName}`
        });
      }
    }

    await post.save();
    return successResponse(res, 
      { likesCount: post.likes.length, likes: post.likes }, 
      isLiked ? 'Like removed' : 'Post liked'
    );
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
    const userId = req.user._id;

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

    const { caption } = req.body;
    const { postId } = req.params;
    const userId = req.user._id;

    const post = await Post.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    if (post.user.toString() !== userId.toString()) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    post.caption = caption;
    
    if (req.body.replaceMedia === 'true' && post.media && post.media.length > 0) {
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
      
      await Promise.all(deletePromises);
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

    const { postId, commentText } = req.body;
    const userId = req.user._id;
    
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

    // Create notification for the post owner if the commenter is not the owner
    if (post.user.toString() !== userId.toString()) {
      await createCommentNotification({
        senderId: userId,
        receiverId: post.user,
        entityId: postId,
        entityType: 'Post',
        senderName: `${req.user.firstName} ${req.user.lastName}`
      });
    }

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

    const { commentId, replyText } = req.body;
    const userId = req.user._id;
    
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

    // Create notification for the comment owner if the replier is not the owner
    if (comment.user.toString() !== userId.toString()) {
      await createReplyNotification({
        senderId: userId,
        receiverId: comment.user,
        entityId: commentId,
        postId: post._id,
        entityType: 'Post',
        senderName: `${req.user.firstName} ${req.user.lastName}`
      });
    }

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
  const userId = req.user._id;

  const post = await Post.findById(postId);
  if (!post) {
    return errorResponse(res, 'Post not found', 404);
  }

  if (post.user.toString() !== userId.toString()) {
    return errorResponse(res, 'Unauthorized to modify this post', 403);
  }

  const mediaItem = post.media.id(mediaId);
  if (!mediaItem) {
    return errorResponse(res, 'Media item not found', 404);
  }

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

  post.media.pull(mediaId);
  await post.save();

  return successResponse(res, post, 'Media item deleted successfully');
});

// Hide a post
const hidePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const userId = req.user._id;

  const post = await Post.findById(postId);
  if (!post) {
    return errorResponse(res, 'Post not found', 404);
  }

  if (post.user.toString() !== userId.toString()) {
    return errorResponse(res, 'Unauthorized to modify this post', 403);
  }

  post.isHidden = true;
  await post.save();

  return successResponse(res, post, 'Post hidden successfully');
});

// Unhide a post
const unhidePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const userId = req.user._id;

  const post = await Post.findById(postId);
  if (!post) {
    return errorResponse(res, 'Post not found', 404);
  }

  if (post.user.toString() !== userId.toString()) {
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
    
    // Import all required post models
    const SanghPost = require('../../models/SanghModels/sanghPostModel');
    const PanchPost = require('../../models/SanghModels/panchPostModel');
    const VyaparPost = require('../../models/VyaparModels/vyaparPostModel');
    const TirthPost = require('../../models/TirthModels/tirthPostModel');
    const SadhuPost = require('../../models/SadhuModels/sadhuPostModel');
    
    // Get all posts from different models with Promise.all for parallel execution
    const [userPosts, sanghPosts, panchPosts, vyaparPosts, tirthPosts, sadhuPosts] = await Promise.all([
      // Regular user posts
      Post.find({ isHidden: false })
        .populate('user', 'firstName lastName profilePicture')
        .sort('-createdAt')
        .select('caption media user likes comments createdAt')
        .lean(),
      
      // Sangh posts
      SanghPost.find({ isHidden: false })
        .populate('sanghId', 'name level location')
        .populate('postedByUserId', 'firstName lastName fullName profilePicture')
        .sort('-createdAt')
        .select('caption media sanghId postedByUserId postedByRole likes comments createdAt')
        .lean(),
      
      // Panch posts
      PanchPost.find({ isHidden: false })
        .populate('panchId', 'accessId')
        .populate('sanghId', 'name level location')
        .sort('-createdAt')
        .select('caption media panchId sanghId postedByMemberId postedByName likes comments createdAt')
        .lean(),
        
      // Vyapar posts
      VyaparPost.find({ isHidden: false })
        .populate('vyaparId', 'name businessType')
        .populate('postedByUserId', 'firstName lastName fullName profilePicture')
        .sort('-createdAt')
        .select('caption media vyaparId postedByUserId likes comments createdAt')
        .lean(),
        
      // Tirth posts
      TirthPost.find({ isHidden: false })
        .populate('tirthId', 'name location')
        .populate('postedByUserId', 'firstName lastName fullName profilePicture')
        .sort('-createdAt')
        .select('caption media tirthId postedByUserId likes comments createdAt')
        .lean(),
        
      // Sadhu posts
      SadhuPost.find({ isHidden: false })
        .populate('sadhuId', 'sadhuName uploadImage')
        .populate('postedByUserId', 'firstName lastName fullName profilePicture')
        .sort('-createdAt')
        .select('caption media sadhuId postedByUserId likes comments createdAt')
        .lean()
    ]);
    
    // Add post type for frontend differentiation
    const postsWithTypes = [
      ...userPosts.map(post => ({ ...post, postType: 'user' })),
      ...sanghPosts.map(post => ({ ...post, postType: 'sangh' })),
      ...panchPosts.map(post => ({ ...post, postType: 'panch' })),
      ...vyaparPosts.map(post => ({ ...post, postType: 'vyapar' })),
      ...tirthPosts.map(post => ({ ...post, postType: 'tirth' })),
      ...sadhuPosts.map(post => ({ ...post, postType: 'sadhu' }))
    ];
    
    // Sort all posts by creation date
    const sortedPosts = postsWithTypes.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    // Apply pagination after combining all posts
    const paginatedPosts = sortedPosts.slice(skip, skip + limit);
    
    // Get total count for pagination
    const totalPosts = sortedPosts.length;
    
    return successResponse(res, {
      posts: paginatedPosts,
      pagination: {
        total: totalPosts,
        page,
        pages: Math.ceil(totalPosts / limit)
      }
    }, 'Combined feed retrieved successfully');
  } catch (error) {
    console.error('Error in getCombinedFeed:', error);
    return errorResponse(res, 'Error retrieving combined feed', 500, error.message);
  }
});

// Optimized version of combined feed with cursor-based pagination
const getCombinedFeedOptimized = asyncHandler(async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const cursor = req.query.cursor; // timestamp of the oldest post in the previous batch
  
    
    // Build query based on cursor
    const cursorQuery = cursor ? { createdAt: { $lt: new Date(cursor) } } : {};
    
    // Get posts from each model with the cursor filter
    const [userPosts, sanghPosts, panchPosts, vyaparPosts, tirthPosts, sadhuPosts] = await Promise.all([
      // Regular user posts
      Post.find({ ...cursorQuery, isHidden: false })
        .populate('user', 'firstName lastName profilePicture')
        .sort('-createdAt')
        .select('caption media user likes comments createdAt')
        .limit(limit)
        .lean(),
      
      // Sangh posts
      SanghPost.find({ ...cursorQuery, isHidden: false })
        .populate('sanghId', 'name level location')
        .populate('postedByUserId', 'firstName lastName fullName profilePicture')
        .sort('-createdAt')
        .select('caption media sanghId postedByUserId postedByRole likes comments createdAt')
        .limit(limit)
        .lean(),
      
      // Panch posts
      PanchPost.find({ ...cursorQuery, isHidden: false })
        .populate('panchId', 'accessId')
        .populate('sanghId', 'name level location')
        .sort('-createdAt')
        .select('caption media panchId sanghId postedByMemberId postedByName likes comments createdAt')
        .limit(limit)
        .lean(),
        
      // Vyapar posts
      VyaparPost.find({ ...cursorQuery, isHidden: false })
        .populate('vyaparId', 'name businessType')
        .populate('postedByUserId', 'firstName lastName fullName profilePicture')
        .sort('-createdAt')
        .select('caption media vyaparId postedByUserId likes comments createdAt')
        .limit(limit)
        .lean(),
        
      // Tirth posts
      TirthPost.find({ ...cursorQuery, isHidden: false })
        .populate('tirthId', 'name location')
        .populate('postedByUserId', 'firstName lastName fullName profilePicture')
        .sort('-createdAt')
        .select('caption media tirthId postedByUserId likes comments createdAt')
        .limit(limit)
        .lean(),
        
      // Sadhu posts
      SadhuPost.find({ ...cursorQuery, isHidden: false })
        .populate('sadhuId', 'sadhuName uploadImage')
        .populate('postedByUserId', 'firstName lastName fullName profilePicture')
        .sort('-createdAt')
        .select('caption media sadhuId postedByUserId likes comments createdAt')
        .limit(limit)
        .lean()
    ]);
    
    // Add post type for frontend differentiation
    const postsWithTypes = [
      ...userPosts.map(post => ({ ...post, postType: 'user' })),
      ...sanghPosts.map(post => ({ ...post, postType: 'sangh' })),
      ...panchPosts.map(post => ({ ...post, postType: 'panch' })),
      ...vyaparPosts.map(post => ({ ...post, postType: 'vyapar' })),
      ...tirthPosts.map(post => ({ ...post, postType: 'tirth' })),
      ...sadhuPosts.map(post => ({ ...post, postType: 'sadhu' }))
    ];
    
    // Sort all posts by creation date
    const sortedPosts = postsWithTypes.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    ).slice(0, limit);
    
    // Get the next cursor (timestamp of the oldest post)
    const nextCursor = sortedPosts.length > 0 
      ? sortedPosts[sortedPosts.length - 1].createdAt.toISOString() 
      : null;
    
    // Check if there are more posts
    const hasMore = sortedPosts.length === limit;
    
    return successResponse(res, {
      posts: sortedPosts,
      pagination: {
        nextCursor,
        hasMore
      }
    }, 'Combined feed retrieved successfully');
  } catch (error) {
    console.error('Error in getCombinedFeedOptimized:', error);
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
  getCombinedFeed,
  getCombinedFeedOptimized
};