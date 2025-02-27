const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['follow_request', 'follow_request_accepted', 'like', 'comment', 'reply'], required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false, index: true }, // Index added for faster queries
  },
  { timestamps: true }
);

// Indexes for faster queries
notificationSchema.index({ receiverId: 1, createdAt: -1 }); // For fetching user notifications in descending order
notificationSchema.index({ receiverId: 1, isRead: 1 }); // For fetching unread notifications

// Virtual field to count unread notifications
notificationSchema.virtual('unreadCount').get(function() {
  return this.model('Notification').countDocuments({ receiverId: this.receiverId, isRead: false });
});

module.exports = mongoose.model('Notification', notificationSchema);