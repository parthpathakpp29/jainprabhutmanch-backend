const JainVyaparPost = require('../../models/VyaparModels/vyaparPostModel');
const JainVyapar = require('../../models/VyaparModels/vyaparModel');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { s3Client, DeleteObjectCommand } = require('../../config/s3Config');
const { extractS3KeyFromUrl } = require('../../utils/s3Utils');
const { createLikeNotification, createCommentNotification, createReplyNotification } = require('../../utils/notificationUtils');
const { getOrSetCache, invalidateCache, invalidatePattern } = require('../../utils/cache');
const { convertS3UrlToCDN } = require('../../utils/s3Utils');


// Create new Vyapar post
const createPost = async (req, res) => {
  try {
    const { vyaparId } = req.params;
    const { caption } = req.body;

    // Handle uploaded media files
    const media = [];

    if (req.files) {
      // Handle images
      if (req.files.image) {
        media.push(...req.files.image.map(file => ({
          type: 'image',
          url: convertS3UrlToCDN(file.location)
        })));
      }

      if (req.files.video) {
        media.push(...req.files.video.map(file => ({
          type: 'video',
          url: convertS3UrlToCDN(file.location)
        })));
      }

    }

    const postData = {
      vyaparId,
      caption,
      media,
      postedByUserId: req.user._id
    };

    const post = new JainVyaparPost(postData);
    await post.save();
    await invalidateCache(`vyaparPosts:${req.params.vyaparId}:page:1:limit:10`);

    await invalidateCache(`vyapar:${vyaparId}:stats`);

    return successResponse(res, {
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    // If there's an error, clean up any uploaded files
    if (req.files) {
      const deletePromises = [];
      if (req.files.image) {
        deletePromises.push(...req.files.image.map(file =>
          s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: extractS3KeyFromUrl(file.location)
          }))
        ));
      }
      if (req.files.video) {
        deletePromises.push(...req.files.video.map(file =>
          s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: extractS3KeyFromUrl(file.location)
          }))
        ));
      }

      try {
        await Promise.all(deletePromises);
      } catch (deleteError) {
        console.error('Error deleting files:', deleteError);
      }
    }

    return errorResponse(res, 'Failed to create post', 500, error.message);
  }
};

// Get all posts for a vyapar
const getPosts = async (req, res) => {
  const { vyaparId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const cacheKey = `vyaparPosts:${vyaparId}:page:${page}:limit:${limit}`;

  const result = await getOrSetCache(cacheKey, async () => {
    const skip = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      JainVyaparPost.find({ vyaparId, isHidden: false })
        .populate('vyaparId', 'name businessType')
        .populate('postedByUserId', 'firstName lastName profilePicture')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean(),
      JainVyaparPost.countDocuments({ vyaparId, isHidden: false })
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

  result.posts = result.posts.map(post => ({
    ...post,
    media: post.media.map(m => ({
      ...m,
      url: convertS3UrlToCDN(m.url)
    }))
  }));


  return successResponse(res, result, 'Vyapar posts fetched successfully');
};



// Get a single post by ID
const getPostById = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await getOrSetCache(`vyaparPost:${postId}`, async () => {
      return await JainVyaparPost.findOne({
        _id: postId,
        isHidden: false
      })
        .populate('vyaparId', 'name businessType')
        .populate('postedByUserId', 'firstName lastName profilePicture')
        .populate('likes', 'firstName lastName profilePicture')
        .populate('comments.user', 'firstName lastName profilePicture')
        .populate('comments.replies.user', 'firstName lastName profilePicture');
    }, 3600); // Cache for 1 hour

    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    post.media = post.media.map(m => ({
      ...m,
      url: convertS3UrlToCDN(m.url)
    }));


    return successResponse(res, { post });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch post', 500, error.message);
  }
};

// Update a post
const updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { caption } = req.body;

    const post = await JainVyaparPost.findById(postId);

    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // Check if user is authorized to update this post
    if (post.postedByUserId.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'Not authorized to update this post', 403);
    }

    // Update fields
    if (caption) post.caption = caption;


    // ✅ Add new media if uploaded
    if (req.files) {
      const newMedia = [];

      if (req.files.image) {
        newMedia.push(
          ...req.files.image.map(file => ({
            type: 'image',
            url: convertS3UrlToCDN(file.location)
          }))
        );
      }

      if (req.files.video) {
        newMedia.push(
          ...req.files.video.map(file => ({
            type: 'video',
            url: convertS3UrlToCDN(file.location)
          }))
        );
      }

      post.media.push(...newMedia);
    }

    await post.save();
    await invalidateCache(`vyaparPosts:${req.params.vyaparId}:page:1:limit:10`);
    await invalidateCache(`vyaparPost:${postId}`);
 
    return successResponse(res, {
      message: 'Post updated successfully',
      post
    });
  } catch (error) {
    return errorResponse(res, 'Failed to update post', 500, error.message);
  }
};


const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await JainVyaparPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // ✅ Authorization check
    if (post.postedByUserId.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'Not authorized to delete this post', 403);
    }

    // ✅ Extract S3 keys from media URLs
    const mediaKeys = post.media.map(m => {
      const url = m.url;
      // Works for both S3 URLs and CloudFront
      const key = url.includes('.com/') ? url.split('.com/')[1] : url;
      return { Key: key };
    });

    if (mediaKeys.length > 0) {
      const deleteParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Delete: { Objects: mediaKeys }
      };

      await s3Client.send(new DeleteObjectsCommand(deleteParams));
    }

    // ✅ Soft-delete
    post.isHidden = true;
    await post.save();

    // ✅ Invalidate cache
    await invalidateCache(`vyaparPosts:${req.params.vyaparId}:page:1:limit:10`);
    await invalidateCache(`vyaparPost:${postId}`);
 

    return successResponse(res, {
      message: 'Post deleted successfully'
    });
  } catch (error) {
    return errorResponse(res, 'Failed to delete post', 500, error.message);
  }
};


// Toggle like on a post
const toggleLike = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    const post = await JainVyaparPost.findById(postId)
      .populate('postedByUserId', 'firstName lastName');

    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    const result = post.toggleLike(userId);
    await post.save();
    await invalidateCache(`vyaparPost:${postId}`);
    await invalidateCache(`vyaparPostLikes:${postId}`);

    // Create notification if the post was liked (not unliked)
    if (result.isLiked && post.postedByUserId._id.toString() !== userId.toString()) {
      await createLikeNotification({
        senderId: userId,
        receiverId: post.postedByUserId._id,
        entityId: postId,
        entityType: 'sanghPost',
        senderName: `${req.user.firstName} ${req.user.lastName}`
      });
    }

    return successResponse(res, result, `Post ${result.isLiked ? 'liked' : 'unliked'} successfully`);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Add a comment to a post
const addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text) {
      return errorResponse(res, 'Comment text is required', 400);
    }

    const post = await JainVyaparPost.findById(postId)
      .populate('postedByUserId', 'firstName lastName');

    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    const comment = post.addComment(userId, text);
    await post.save();
    await invalidateCache(`vyaparPost:${postId}`);
    await invalidateCache(`vyaparPostComments:${postId}`);

    // Populate user info for the new comment
    await post.populate('comments.user', 'firstName lastName profilePicture');
    const newComment = post.comments.id(comment._id);

    // Create notification for post owner (if commenter is not the owner)
    if (post.postedByUserId._id.toString() !== userId.toString()) {
      await createCommentNotification({
        senderId: userId,
        receiverId: post.postedByUserId._id,
        entityId: postId,
        entityType: 'vyaparPost',
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
};

// Delete a comment from a post
const deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    const post = await JainVyaparPost.findOneAndUpdate(
      {
        _id: postId,
        'comments._id': commentId,
        'comments.user': req.user._id
      },
      {
        $pull: {
          comments: { _id: commentId }
        }
      },
      { new: true }
    )
      .populate('comments.user', 'firstName lastName profilePicture');

    if (!post) {
      return errorResponse(res, 'Comment not found or unauthorized', 404);
    }

    return successResponse(res, {
      message: 'Comment deleted successfully',
      comments: post.comments
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Add a reply to a comment
const addReply = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text) {
      return errorResponse(res, 'Reply text is required', 400);
    }

    const post = await JainVyaparPost.findById(postId);
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
    await invalidateCache(`vyaparPost:${postId}`);
    await invalidateCache(`vyaparPostComments:${postId}`);

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
        entityType: 'vyaparPost',
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
};

// Get replies for a comment
const getReplies = async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    const post = await JainVyaparPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      return errorResponse(res, 'Comment not found', 404);
    }

    // Populate user info for replies
    await post.populate('comments.replies.user', 'firstName lastName profilePicture');

    // Get the updated comment with populated replies
    const updatedComment = post.comments.id(commentId);

    return successResponse(res, {
      replies: updatedComment.replies
    });
  } catch (error) {
    return errorResponse(res, 'Failed to get replies', 500, error.message);
  }
};

// Delete a reply from a comment
const deleteReply = async (req, res) => {
  try {
    const { postId, commentId, replyId } = req.params;

    const post = await JainVyaparPost.findOneAndUpdate(
      {
        _id: postId,
        'comments._id': commentId,
        'comments.replies._id': replyId,
        'comments.replies.user': req.user._id
      },
      {
        $pull: {
          'comments.$.replies': { _id: replyId }
        }
      },
      { new: true }
    )
      .populate('comments.replies.user', 'firstName lastName profilePicture');

    if (!post) {
      return errorResponse(res, 'Reply not found or unauthorized', 404);
    }

    const updatedComment = post.comments.id(commentId);

    return successResponse(res, {
      message: 'Reply deleted successfully',
      replies: updatedComment.replies
    });
  } catch (error) {
    return errorResponse(res, 'Failed to delete reply', 500, error.message);
  }
};

// Delete a specific media item from a post
const deleteMedia = async (req, res) => {
  try {
    const { postId, mediaUrl } = req.body;

    // Find the post
    const post = await JainVyaparPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // Check if user is authorized to update this post
    if (post.postedByUserId.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'Not authorized to update this post', 403);
    }

    // Find the media item
    const mediaIndex = post.media.findIndex(item => item.url === mediaUrl);
    if (mediaIndex === -1) {
      return errorResponse(res, 'Media not found in post', 404);
    }

    // Extract the S3 key from the URL
    const s3Key = extractS3KeyFromUrl(mediaUrl);

    // Delete from S3
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key
      }));
    } catch (s3Error) {
      console.error('Error deleting media from S3:', s3Error);
      // Continue with removing from DB even if S3 deletion fails
    }

    // Remove the media item from the post
    post.media.splice(mediaIndex, 1);
    await post.save();

    return successResponse(res, {
      message: 'Media deleted successfully',
      post
    });
  } catch (error) {
    return errorResponse(res, 'Failed to delete media', 500, error.message);
  }
};

// Hide/Unhide a post
const toggleHidePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { isHidden } = req.body;

    const post = await JainVyaparPost.findById(postId);
    if (!post) {
      return errorResponse(res, 'Post not found', 404);
    }

    // Check if user is authorized to update this post
    if (post.postedByUserId.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'Not authorized to update this post', 403);
    }

    post.isHidden = isHidden;
    await post.save();

    return successResponse(res, {
      message: isHidden ? 'Post hidden successfully' : 'Post unhidden successfully',
      post
    });
  } catch (error) {
    return errorResponse(res, 'Failed to update post visibility', 500, error.message);
  }
};

const getAllVyaparPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const cacheKey = `allVyaparPosts:page:${page}:limit:${limit}`;

    const result = await getOrSetCache(cacheKey, async () => {
      const posts = await JainVyaparPost.find({ isHidden: false })
        .populate('vyaparId', 'name businessType')
        .populate('postedByUserId', 'firstName lastName profilePicture')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await JainVyaparPost.countDocuments({ isHidden: false });

      return {
        posts,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit)
        }
      };
    }, 180);

    result.posts = result.posts.map(post => ({
      ...post,
      media: post.media.map(m => ({
        ...m,
        url: convertS3UrlToCDN(m.url)
      }))
    }));


    return successResponse(res, result, 'All Vyapar posts fetched');
  } catch (error) {
    return errorResponse(res, 'Failed to fetch Vyapar posts', 500, error.message);
  }
};


module.exports = {
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
  toggleHidePost,
  getAllVyaparPosts
};
