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
  updateGroupDetails
} = require('../../controller/SocialMediaControllers/groupChatController');
const { authenticate } = require('../../middlewares/authMiddlewares');
const upload = require('../../middlewares/uploadMiddleware');

// Apply authentication to all routes
router.use(authenticate);

// Create a new group chat
router.post('/create', upload.single('groupImage'), createGroupChat);

// Get group details
router.get('/group/:groupId', getGroupDetails);

// Get all groups for a user
router.get('/user-groups', getAllGroups);

// Get all group chats
router.get('/all-chats', getAllGroupChats);

// Send group message
router.post('/send-message', upload.single('chatImage'), sendGroupMessage);

// Get all messages for a group
router.get('/messages/:groupId', getGroupMessages);

// Delete group message
router.delete('/messages/:groupId/:messageId', deleteGroupMessage);

// Update group details (name, image, members)
router.put('/update/:groupId', upload.single('groupImage'), updateGroupDetails);

module.exports = router;