const express = require('express');
const { 
  createMessage, 
  getAllMessages, 
  getMessageById, 
  getMessages, 
  getUnreadMessagesCount, 
  deleteMessageById
} = require('../../controller/SocialMediaControllers/messageController');
const { authenticate } = require('../../middlewares/authMiddlewares');
const upload = require('../../middlewares/uploadMiddleware');
const { check, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Rate limiting for message creation to prevent spam
const messageRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each user to 10 messages per minute
  message: {
    success: false,
    message: 'Too many messages sent. Please slow down.'
  },
  standardHeaders: true,
  keyGenerator: (req) => req.user ? req.user.id : req.ip
});

// Create a new message
router.post('/create', 
  messageRateLimit,
  upload.single('chatImage'), 
  [
    check('receiver').isMongoId().withMessage('Invalid receiver ID'),
    check('message').isString().notEmpty().withMessage('Message content is required')
      .isLength({ max: 2000 }).withMessage('Message cannot exceed 2000 characters')
  ],
  createMessage
);

// Get all messages for a user
router.get('/all/:userId', 
  [
    param('userId').isMongoId().withMessage('Invalid user ID')
  ],
  getAllMessages
);

// Get a specific message by ID
router.get('/:messageId', 
  [
    param('messageId').isMongoId().withMessage('Invalid message ID')
  ],
  getMessageById
);

// Get messages between users with pagination
router.get('/', 
  [
    query('sender').isMongoId().withMessage('Invalid sender ID'),
    query('receiver').isMongoId().withMessage('Invalid receiver ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ],
  getMessages
);

// Get unread message count
router.get('/unread/:userId', 
  [
    param('userId').isMongoId().withMessage('Invalid user ID')
  ],
  getUnreadMessagesCount
);

// Delete a message
router.delete('/:id', 
  [
    param('id').isMongoId().withMessage('Invalid message ID')
  ],
  deleteMessageById
);

module.exports = router;