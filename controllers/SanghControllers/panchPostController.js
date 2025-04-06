const PanchPost = require('../../models/SanghModels/panchPostModel');
const Panch = require('../../models/SanghModels/panchModel');
const asyncHandler = require('express-async-handler');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { s3Client, DeleteObjectCommand } = require('../../config/s3Config');
const { extractS3KeyFromUrl } = require('../../utils/s3Utils');
const Notification = require('../../models/SocialMediaModels/notificationModel');
const { getIo } = require('../../websocket/socket');
const { validationResult } = require('express-validator');
const { createLikeNotification, createCommentNotification, createReplyNotification } = require('../../utils/notificationUtils');
const { getOrSetCache, invalidateCache } = require('../../utils/cache');

// Create a post as Panch member
const createPanchPost = asyncHandler(async (req, res) => {
  try {
    const { caption } = req.body;
    const panchGroup = req.panchGroup;
    const panchMember = req.panchMember;
    const sanghId = req.sanghId;

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

    // Create the post
    const post = await PanchPost.create({
      panchId: panchGroup._id,
      sanghId: sanghId,
      postedByMemberId: panchMember._id,
      postedByName: `${panchMember.personalDetails.firstName} ${panchMember.personalDetails.surname}`,
      caption,
      media: mediaFiles
    });

    // Populate Panch and Sangh details for response
    const populatedPost = await PanchPost.findById(post._id)
      .populate('panchId', 'accessId')
      .populate('sanghId', 'name level location');
    await invalidateCache('panchPosts:page:1:limit:10')
    await invalidatePattern(`panchPosts:${panchGroup._id}:*`);
    await invalidatePattern('allPanchPosts:*');
    await invalidateCache(`panch:${panchGroup._id}:stats`);

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

// Get posts by Panch ID
const getPanchPosts = asyncHandler(async (req, res) => {
  try {
    const { panchId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const cacheKey = `panchPosts:${panchId}:page:${page}:limit:${limit}`;

    const result = await getOrSetCache(cacheKey, async () => {
      const skip = (page - 1) * limit;
      const [panchGroup, [posts, total]] = await Promise.all([
        Panch.findById(panchId).select('status').lean(),
        Promise.all([
          PanchPost.find({
            panchId,
            isHidden: false
          })
            .select('caption media postedByName createdAt likes comments')
            .populate('panchId', 'accessId')
            .populate('sanghId', 'name level location')
            .populate('comments.user', 'firstName lastName fullName profilePicture')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit)
            .lean(),
          PanchPost.countDocuments({
            panchId,
            isHidden: false
          })
        ])
      ]);

      if (!panchGroup) {
        throw new Error('Panch group not found');
      }

      return {
        posts,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit)
        }
      };
    }, 300); // Cache for 5 minutes

    return successResponse(res, result, 'Panch posts retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});
// Get all Panch posts for social feed


const getAllPanchPosts = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const cacheKey = `allPanchPosts:page:${page}:limit:${limit}`;

    const result = await getOrSetCache(cacheKey, async () => {
      const skip = (page - 1) * limit;
      const [posts, total] = await Promise.all([
        PanchPost.find({ isHidden: false })
          .populate('panchId', 'accessId')
          .populate('sanghId', 'name level location')
          .sort('-createdAt')
          .skip(skip)
          .limit(limit)
          .lean(),
        PanchPost.countDocuments({ isHidden: false })
      ]);

      return {
        posts,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit)
        }
      };
    }, 300); // Cache for 5 minutes

    return successResponse(res, result, 'Panch posts retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});


// Toggle like on a Panch post
const toggleLikePanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    const post = await panchPost.findById(postId)
      .populate('postedByUserId', 'firstName lastName');

    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    const result = post.toggleLike(userId);
    await post.save();
    await invalidateCache(`panchPost:${postId}`);
    await invalidateCache(`panchPostLikes:${postId}`);


    // Create notification if the post was liked (not unliked)
    if (result.isLiked && post.postedByUserId._id.toString() !== userId.toString()) {
      await createLikeNotification({
        senderId: userId,
        receiverId: post.postedByUserId._id,
        entityId: postId,
        entityType: 'panchPost',
        senderName: `${req.user.firstName} ${req.user.lastName}`
      });
    }

    return successResponse(res, result, `Post ${result.isLiked ? 'liked' : 'unliked'} successfully`);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Add comment to a Panch post
const commentOnPanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text) {
      return errorResponse(res, 'Comment text is required', 400);
    }

    const post = await PanchPost.findById(postId)
      .populate('postedByUserId', 'firstName lastName');

    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    const comment = post.addComment(userId, text);
    await post.save();
    await invalidateCache(`panchPost:${postId}`);
    await invalidateCache(`panchPostComments:${postId}`);

    // Populate user info for the new comment
    await post.populate('comments.user', 'firstName lastName profilePicture');
    const newComment = post.comments.id(comment._id);

    // Create notification for post owner (if commenter is not the owner)
    if (post.postedByUserId._id.toString() !== userId.toString()) {
      await createCommentNotification({
        senderId: userId,
        receiverId: post.postedByUserId._id,
        entityId: postId,
        entityType: 'panchPost',
        senderName: `${req.user.firstName} ${req.user.lastName}`
      });
    }

    return successResponse(res, {
      comment: newComment,
      commentCount: post.comments.length
    }, 'Comment added successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Delete a Panch post (only by the creator or superadmin)
const deletePanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const panchMember = req.panchMember;

    const post = await PanchPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // Check if user is authorized to delete
    if (post.postedByMemberId.toString() !== panchMember._id.toString() && req.user.role !== 'superadmin') {
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
    await invalidateCache('panchPosts:page:1:limit:10')
    // In deletePanchPost (after deletion):
    await invalidateCache(`panchPost:${postId}`);
    await invalidatePattern(`panchPosts:${post.panchId}:*`);
    await invalidatePattern('allPanchPosts:*');
    return successResponse(res, null, 'Post deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Add update post functionality with S3 handling
const updatePanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const { caption } = req.body;
    const panchMember = req.panchMember;

    const post = await PanchPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // Check authorization
    if (post.postedByMemberId.toString() !== panchMember._id.toString()) {
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
    await invalidateCache(`panchPost:${postId}`);
    await invalidatePattern(`panchPosts:${post.panchId}:*`);
    await invalidatePattern('allPanchPosts:*');

    const updatedPost = await PanchPost.findById(postId)
      .populate('panchId', 'accessId')
      .populate('sanghId', 'name level location');

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

// Get Panch member access key
const getPanchMemberAccessKey = asyncHandler(async (req, res) => {
  try {
    const { panchId, jainAadharNumber } = req.body;

    // Find the Panch group
    const panchGroup = await Panch.findById(panchId);
    if (!panchGroup) {
      return errorResponse(res, 'Panch group not found', 404);
    }

    // Find the member by Jain Aadhar number
    const member = panchGroup.members.find(m =>
      m.personalDetails.jainAadharNumber === jainAadharNumber &&
      m.status === 'active'
    );

    if (!member) {
      return errorResponse(res, 'Member not found or inactive', 404);
    }

    return successResponse(res, {
      accessKey: member.accessKey,
      memberName: `${member.personalDetails.firstName} ${member.personalDetails.surname}`
    }, 'Access key retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Add reply to a comment
const addReplyToPanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text) {
      return errorResponse(res, 'Reply text is required', 400);
    }

    const post = await PanchPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      return errorResponse(res, 'Comment not found', 404);
    }

    comment.replies.push({
      user: userId,
      text,
      createdAt: new Date()
    });

    await post.save();
    await invalidateCache(`panchPost:${postId}`);
    await invalidateCache(`panchPostComments:${postId}`);

    // Populate user info for the new reply
    await post.populate('comments.replies.user', 'firstName lastName profilePicture');
    const updatedComment = post.comments.id(commentId);
    const newReply = updatedComment.replies[updatedComment.replies.length - 1];

    // Create notification for comment owner (if replier is not the comment owner)
    if (comment.user.toString() !== userId.toString()) {
      await createReplyNotification({
        senderId: userId,
        receiverId: comment.user,
        entityId: commentId,
        postId: postId,
        entityType: 'panchPost',
        senderName: `${req.user.firstName} ${req.user.lastName}`
      });
    }

    return successResponse(res, {
      reply: newReply,
      replyCount: updatedComment.replies.length
    }, 'Reply added successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Get replies for a specific comment
const getRepliesForPanchPost = asyncHandler(async (req, res) => {
  try {
    const { commentId } = req.params;

    const post = await PanchPost.findOne({ 'comments._id': commentId });
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
const deleteMediaItemFromPanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId, mediaId } = req.params;
    const panchMember = req.panchMember;

    const post = await PanchPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // Check authorization
    if (post.postedByMemberId.toString() !== panchMember._id.toString() && req.user.role !== 'superadmin') {
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

const getPanchPostById = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await getOrSetCache(`panchPost:${postId}`, async () => {
      return await PanchPost.findOne({
        _id: postId,
        isHidden: false
      })
        .populate('panchId', 'accessId')
        .populate('sanghId', 'name level location')
        .populate('likes', 'firstName lastName profilePicture')
        .populate('comments.user', 'firstName lastName fullName profilePicture')
        .populate('comments.replies.user', 'firstName lastName fullName profilePicture');
    }, 3600); // Cache for 1 hour

    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    return successResponse(res, { post });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Hide a Panch post
const hidePanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const panchMember = req.panchMember;

    const post = await PanchPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // Check authorization
    if (post.postedByMemberId.toString() !== panchMember._id.toString() && req.user.role !== 'superadmin') {
      return errorResponse(res, 'Not authorized to modify this post', 403);
    }

    post.isHidden = true;
    await post.save();

    return successResponse(res, post, 'Post hidden successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Unhide a Panch post
const unhidePanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const panchMember = req.panchMember;

    const post = await PanchPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // Check authorization
    if (post.postedByMemberId.toString() !== panchMember._id.toString() && req.user.role !== 'superadmin') {
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
  createPanchPost,
  getPanchPosts,
  getAllPanchPosts,
  getPanchPostById,
  toggleLikePanchPost,
  commentOnPanchPost,
  deletePanchPost,
  updatePanchPost,
  getPanchMemberAccessKey,
  addReplyToPanchPost,
  getRepliesForPanchPost,
  deleteMediaItemFromPanchPost,
  hidePanchPost,
  unhidePanchPost
};