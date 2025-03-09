const Friendship = require('../../models/SocialMediaModels/friendshipModel');
const asyncHandler = require('express-async-handler');
const Notification = require('../../models/SocialMediaModels/notificationModel');
const { getIo } = require('../../websocket/socket');
const { successResponse, errorResponse } = require('../../utils/apiResponse');

// Follow a user
const followUser = asyncHandler(async (req, res) => {
  const { followerId, followingId } = req.body;

  if (followerId === followingId) {
    return errorResponse(res, 'You cannot follow yourself', 400);
  }

  const existingFriendship = await Friendship.findOne({ 
    follower: followerId, 
    following: followingId 
  });

  if (existingFriendship) {
    return errorResponse(res, 'Already following this user', 400);
  }

  const newFriendship = await Friendship.create({ 
    follower: followerId, 
    following: followingId 
  });

  // Send a follow notification
  const notification = new Notification({
    senderId: followerId,
    receiverId: followingId,
    type: 'new_follower',
    message: 'started following you.',
  });
  await notification.save();

  // Emit the notification event
  const io = getIo();
  io.to(followingId.toString()).emit('newNotification', notification);

  return successResponse(res, { friendship: newFriendship }, 'Successfully followed user', 201);
});

// Unfollow a user
const unfollowUser = asyncHandler(async (req, res) => {
  const { followerId, followingId } = req.body;

  const friendship = await Friendship.findOneAndDelete({ 
    follower: followerId, 
    following: followingId 
  });

  if (!friendship) {
    return errorResponse(res, 'Not following this user', 400);
  }

  return successResponse(res, null, 'Successfully unfollowed user');
});

// Get followers of a user
const getFollowers = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const followers = await Friendship.find({ following: userId })
    .populate('follower', 'firstName lastName fullName profilePicture');

  return successResponse(res, followers, 'Followers retrieved successfully');
});

// Get users that a user is following
const getFollowing = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const following = await Friendship.find({ follower: userId })
    .populate('following', 'firstName lastName fullName profilePicture');

  return successResponse(res, following, 'Following list retrieved successfully');
});

// Check if a user is following another user
const checkFollowStatus = asyncHandler(async (req, res) => {
  const { followerId, followingId } = req.body;
  const existingFriendship = await Friendship.findOne({ 
    follower: followerId, 
    following: followingId 
  });
  return successResponse(res, { isFollowing: !!existingFriendship }, 'Follow status retrieved successfully');
});

module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  checkFollowStatus
};