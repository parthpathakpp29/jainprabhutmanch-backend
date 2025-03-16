const PanchPost = require('../../models/SanghModels/panchPostModel');
const Panch = require('../../models/SanghModels/panchModel');
const HierarchicalSangh = require('../../models/SanghModels/hierarchicalSanghModel');
const User = require('../../models/UserRegistrationModels/userModel');
const asyncHandler = require('express-async-handler');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../../config/s3Config');
const { extractS3KeyFromUrl } = require('../../utils/s3Utils');

// Create a post as Panch member
const createPanchPost = asyncHandler(async (req, res) => {
  try {
    const { content } = req.body;
    const panchGroup = req.panchGroup;
    const panchMember = req.panchMember;
    const sanghId = req.sanghId;
    
    // Validate content
    if (!content) {
      return errorResponse(res, 'Content is required', 400);
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
      content,
      media: mediaFiles
    });
    
    // Populate Panch and Sangh details for response
    const populatedPost = await PanchPost.findById(post._id)
      .populate('panchId', 'accessId')
      .populate('sanghId', 'name level location');
    
    return successResponse(res, populatedPost, 'Post created successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Get posts by Panch ID
const getPanchPosts = asyncHandler(async (req, res) => {
  try {
    const { panchId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Verify Panch exists
    const panchGroup = await Panch.findById(panchId);
    if (!panchGroup) {
      return errorResponse(res, 'Panch group not found', 404);
    }
    
    // Get posts with pagination
    const posts = await PanchPost.find({ 
      panchId,
      isHidden: false 
    })
      .populate('panchId', 'accessId')
      .populate('sanghId', 'name level location')
      .populate('comments.user', 'firstName lastName fullName profilePicture')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);
    
    const total = await PanchPost.countDocuments({ 
      panchId,
      isHidden: false 
    });
    
    return successResponse(res, {
      posts,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    }, 'Panch posts retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Get all Panch posts for social feed
const getAllPanchPosts = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get all visible Panch posts
    const posts = await PanchPost.find({ isHidden: false })
      .populate('panchId', 'accessId')
      .populate('sanghId', 'name level location')
      .populate('comments.user', 'firstName lastName fullName profilePicture')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);
    
    const total = await PanchPost.countDocuments({ isHidden: false });
    
    return successResponse(res, {
      posts,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    }, 'All Panch posts retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Toggle like on a Panch post
const toggleLikePanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    
    const post = await PanchPost.findById(postId);
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

// Add comment to a Panch post
const commentOnPanchPost = asyncHandler(async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;
    
    if (!text) {
      return errorResponse(res, 'Comment text is required', 400);
    }
    
    const post = await PanchPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }
    
    const comment = post.addComment(userId, text);
    await post.save();
    
    // Populate user details in the comment
    const populatedPost = await PanchPost.findById(postId)
      .populate('comments.user', 'firstName lastName fullName profilePicture');
    
    const populatedComment = populatedPost.comments.id(comment._id);
    
    return successResponse(res, populatedComment, 'Comment added successfully');
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
    
    return successResponse(res, null, 'Post deleted successfully');
  } catch (error) {
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

module.exports = {
  createPanchPost,
  getPanchPosts,
  getAllPanchPosts,
  toggleLikePanchPost,
  commentOnPanchPost,
  deletePanchPost,
  getPanchMemberAccessKey
}; 