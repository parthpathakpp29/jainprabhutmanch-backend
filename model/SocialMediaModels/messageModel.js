const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true 
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    // Media attachments (only images)
    attachments: [{
      type: {
        type: String,
        enum: ['image'],
        required: true
      },
      url: {
        type: String,
        required: true
      },
      name: String, // Original file name
      size: Number // File size in bytes
    }],
    // Message status
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
      index: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date
    },
    // For deleted messages
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: Date,
    // For reply feature
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    }
  },
  { 
    timestamps: true 
  }
);

// Indexes for common queries
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, isRead: 1 });

// Method to mark message as read
messageSchema.methods.markAsRead = async function() {
  if (!this.isRead) {
    this.isRead = true;
    this.status = 'read';
    this.readAt = new Date();
    await this.save();
  }
};

// Method to soft delete message
messageSchema.methods.softDelete = async function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  await this.save();
};

module.exports = mongoose.model('Message', messageSchema);