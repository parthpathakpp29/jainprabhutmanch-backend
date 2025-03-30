const Notification = require('../../models/SocialMediaModels/notificationModel');
const { getIo } = require('../../websocket/socket');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { createNotification } = require('../../utils/notificationUtils');

// Send Notification
exports.sendNotification = async (req, res) => {
  try {
    const { senderId, receiverId, type, message, entityId, entityType } = req.body;

    // Validate input
    if (!senderId || !receiverId || !type || !message || !entityId || !entityType) {
      return errorResponse(res, 'Missing required fields', 400);
    }

    const notification = await createNotification({
      senderId,
      receiverId,
      type,
      message,
      entityId,
      entityType
    });

    if (!notification) {
      return errorResponse(res, 'Failed to create notification', 500);
    }

    // Emit a WebSocket event to the receiver
    const io = getIo();
    io.to(notification.receiverId.toString()).emit('newNotification', notification);

    return successResponse(res, notification, 'Notification sent successfully');
  } catch (error) {
    console.error('Error sending notification:', error);
    return errorResponse(res, 'Failed to send notification', 500);
  }
};

// Fetch Notifications for a User
exports.getNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const notifications = await Notification.find({ receiverId: userId })
      .populate('senderId', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Notification.countDocuments({ receiverId: userId });
    const unreadCount = await Notification.countDocuments({ receiverId: userId, isRead: false });
    
    return successResponse(res, {
      notifications,
      pagination: {
        total,
        unreadCount,
        page,
        pages: Math.ceil(total / limit)
      }
    }, 'Notifications retrieved successfully');
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return errorResponse(res, 'Failed to fetch notifications', 500);
  }
};

// Mark Notification as Read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return errorResponse(res, 'Notification not found', 404);
    }

    // Emit a WebSocket event to the receiver
    const io = getIo();
    io.to(notification.receiverId.toString()).emit('notificationRead', notification);

    return successResponse(res, notification, 'Notification marked as read');
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return errorResponse(res, 'Failed to mark notification as read', 500);
  }
};

// Mark All Notifications as Read
exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.params;
    
    await Notification.updateMany(
      { receiverId: userId, isRead: false },
      { isRead: true }
    );
    
    return successResponse(res, null, 'All notifications marked as read');
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return errorResponse(res, 'Failed to mark all notifications as read', 500);
  }
};