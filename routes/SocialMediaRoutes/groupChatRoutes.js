const express = require('express');
const router = express.Router();
const { 
  createGroupChat,
  getGroupDetails,
  getAllGroups,
  getAllGroupChats,
  sendGroupMessage,
  getGroupMessages,
  deleteGroupMessage,
  updateGroupDetails,
  leaveGroup,
  updateGroupIcon,
  checkMembership,
  addMembers,
  updateGroupName,
  getUnreadGroupSummary
} = require('../../controllers/SocialMediaControllers/groupChatController');
const { authenticate } = require('../../middlewares/authMiddlewares');
const upload = require('../../middlewares/uploadMiddleware');
const rateLimit = require('express-rate-limit');

// Rate limiting for group creation
const groupCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each user to 5 group creations per hour
  message: {
    success: false,
    message: 'Too many groups created. Please try again later.'
  },
  standardHeaders: true,
  keyGenerator: (req) => req.user ? req.user.id : req.ip
});

// Rate limiting for group messages
const groupMessageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 15, // limit each user to 15 messages per minute
  message: {
    success: false,
    message: 'Too many messages sent. Please slow down.'
  },
  standardHeaders: true,
  keyGenerator: (req) => req.user ? req.user.id : req.ip
});

// Apply authentication to all routes
router.use(authenticate);

// Create a new group chat
router.post('/create', groupCreationLimiter, upload.single('groupImage'), createGroupChat);

// Get group details
router.get('/group/:groupId', getGroupDetails);

// Get all groups for a user
router.get('/user-groups', getAllGroups);

// Get all group chats
router.get('/all-chats', getAllGroupChats);

// Send group message
router.post('/send-message', groupMessageLimiter, upload.single('chatImage'), sendGroupMessage);

// Get all messages for a group
router.get('/messages/:groupId', getGroupMessages);

// Delete group message
router.delete('/messages/:groupId/:messageId', deleteGroupMessage);

//Unread Messages
router.get('/unread-summary', getUnreadGroupSummary);

// Update group details (name, image, members)
router.put('/update/:groupId', upload.single('groupImage'), updateGroupDetails);

// Leave group
router.post('/leave/:groupId', leaveGroup);

// Update group icon
router.post('/icon/:groupId', upload.single('groupIcon'), updateGroupIcon);

// Check group membership
router.get('/check-membership/:groupId', checkMembership);

// Add members to group
router.post('/add-members/:groupId', addMembers);

// Update group name
router.put('/update-name/:groupId', updateGroupName);

module.exports = router;