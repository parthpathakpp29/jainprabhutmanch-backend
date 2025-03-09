const Notification = require('../../models/SocialMediaModels/notificationModel');
const { getIo } = require('../../websocket/socket');
const { successResponse, errorResponse } = require('../../utils/apiResponse');

// Send Notification
exports.sendNotification = async (req, res) => {
  try {
    const { senderId, receiverId, type, message } = req.body;

    // Validate input
    if (!senderId || !receiverId || !type || !message) {
      return errorResponse(res, 'Missing required fields', 400);
    }

    const notification = new Notification({
      senderId,
      receiverId,
      type,
      message,
    });
    await notification.save();

    // Emit a WebSocket event to the receiver
    const io = getIo();
    io.to(receiverId.toString()).emit('newNotification', notification);

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
    const notifications = await Notification.find({ receiverId: userId }).sort({ createdAt: -1 });
    return successResponse(res, notifications, 'Notifications retrieved successfully');
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