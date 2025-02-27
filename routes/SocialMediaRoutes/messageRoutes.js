const express = require('express');
const { 
  createMessage, 
  getAllMessages, 
  getMessageById, 
  getMessages, 
  getUnreadMessagesCount, 
  deleteMessageById,
  sendImageMessage 
} = require('../../controller/SocialMediaControllers/messageController');
const { authenticate } = require('../../middlewares/authMiddlewares');
const upload = require('../../middlewares/uploadMiddleware');
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Create a new text message
router.post('/create', createMessage);

// Send an image message
router.post('/send-image', upload.single('chatImage'), sendImageMessage);

// Get messages
router.get('/', getMessages);

// Get all messages for a user
router.get('/:userId', getAllMessages);

// Get a specific message by its ID
router.get('/message/:messageId', getMessageById);

// Delete message
router.delete('/delete/:id', deleteMessageById);

// Get unread messages count
router.get('/unread/:userId', getUnreadMessagesCount);

module.exports = router;