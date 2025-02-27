const Friendship = require('../../model/SocialMediaModels/friendshipModel');
const asyncHandler = require('express-async-handler');
const Notification = require('../../model/SocialMediaModels/notificationModel');
const { getIo } = require('../../websocket/socket');

// Follow a user
const followUser = asyncHandler(async (req, res) => {
  const { followerId, followingId } = req.body;

  if (followerId === followingId) {
    return res.status(400).json({ message: 'You cannot follow yourself' });
  }

  const existingFriendship = await Friendship.findOne({ follower: followerId, following: followingId });
  if (existingFriendship) {
    return res.status(400).json({ message: 'Already following this user' });
  }

  const newFriendship = await Friendship.create({ follower: followerId, following: followingId, status: 'pending' });

  // Send a follow request notification
  const notification = new Notification({
    senderId: followerId,
    receiverId: followingId,
    type: 'follow_request',
    message: 'You have a new follow request.',
  });
  await notification.save();

  // Emit the notification event to the receiver
  const io = getIo();
  io.to(followingId.toString()).emit('newNotification', notification);

  res.status(201).json({ message: 'User follow request sent successfully', friendship: newFriendship });
});

// Unfollow a user
const unfollowUser = asyncHandler(async (req, res) => {
  const { followerId, followingId } = req.body;

  const friendship = await Friendship.findOneAndDelete({ follower: followerId, following: followingId });
  if (!friendship) {
    return res.status(404).json({ message: 'Follow relationship not found' });
  }

  res.status(200).json({ message: 'User unfollowed successfully' });
});

// Get all followers for a user
const getFollowers = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const followers = await Friendship.find({ following: userId, status: 'accepted' })
    .populate('follower', 'userName email profilePicture');
  res.json(followers);
});

// Get all users a user is following
const getFollowing = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const following = await Friendship.find({ follower: userId, status: 'accepted' })
    .populate('following', 'userName email profilePicture');
  res.json(following);
});

// Check if a user is following another user
const checkFollowStatus = asyncHandler(async (req, res) => {
  const { followerId, followingId } = req.body;
  const existingFriendship = await Friendship.findOne({ follower: followerId, following: followingId });
  res.status(200).json({ status: existingFriendship ? existingFriendship.status : 'not-following' });
});

// Accept a follow request
const acceptFollowRequest = asyncHandler(async (req, res) => {
  const { followerId, followingId } = req.body;
  const updatedFriendship = await Friendship.findOneAndUpdate(
    { follower: followerId, following: followingId, status: 'pending' },
    { status: 'accepted' },
    { new: true }
  );

  if (!updatedFriendship) {
    return res.status(404).json({ message: 'Follow request not found or already accepted' });
  }

  // Send a follow request accepted notification
  const notification = new Notification({
    senderId: followingId,
    receiverId: followerId,
    type: 'follow_request_accepted',
    message: 'Your follow request has been accepted.',
  });
  await notification.save();

  // Emit the notification event to the receiver
  const io = getIo();
  io.to(followerId.toString()).emit('newNotification', notification);

  res.status(200).json({ message: 'Follow request accepted', friendship: updatedFriendship });
});

module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  checkFollowStatus,
  acceptFollowRequest,
};