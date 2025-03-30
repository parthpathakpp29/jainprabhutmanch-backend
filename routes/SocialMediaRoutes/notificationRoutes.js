const express = require('express');
const { sendNotification, getNotifications, markAsRead, markAllAsRead } = require('../../controllers/SocialMediaControllers/notificationController');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

router.post('/send', sendNotification);
router.get('/user/:userId', getNotifications);
router.put('/read/:notificationId', markAsRead);
router.put('/read-all/:userId', markAllAsRead);

module.exports = router;
