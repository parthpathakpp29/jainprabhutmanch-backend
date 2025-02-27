const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  sender: {
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
    name: String,
    size: Number
  }],
  // Message status
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
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
}, {
  timestamps: true
});

const groupChatSchema = new mongoose.Schema({
  groupName: {
    type: String,
    required: true,
    trim: true
  },
  groupImage: {
    type: String
  },
  description: {
    type: String,
    trim: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  groupMembers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    // For muted members
    isMuted: {
      type: Boolean,
      default: false
    },
    mutedUntil: Date
  }],
  groupMessages: [groupMessageSchema],
  // Group settings
  settings: {
    onlyAdminsCanSend: {
      type: Boolean,
      default: false
    },
    onlyAdminsCanAddMembers: {
      type: Boolean,
      default: false
    },
    onlyAdminsCanEditInfo: {
      type: Boolean,
      default: true
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
groupChatSchema.index({ 'groupMembers.user': 1 });
groupChatSchema.index({ creator: 1 });
groupChatSchema.index({ admins: 1 });

// Methods for group management
groupChatSchema.methods.addMember = async function(userId) {
  if (!this.groupMembers.some(member => member.user.toString() === userId.toString())) {
    this.groupMembers.push({ user: userId });
    await this.save();
  }
};

groupChatSchema.methods.removeMember = async function(userId) {
  this.groupMembers = this.groupMembers.filter(
    member => member.user.toString() !== userId.toString()
  );
  await this.save();
};

groupChatSchema.methods.makeAdmin = async function(userId) {
  const member = this.groupMembers.find(
    member => member.user.toString() === userId.toString()
  );
  if (member) {
    member.role = 'admin';
    if (!this.admins.includes(userId)) {
      this.admins.push(userId);
    }
    await this.save();
  }
};

groupChatSchema.methods.muteMember = async function(userId, duration) {
  const member = this.groupMembers.find(
    member => member.user.toString() === userId.toString()
  );
  if (member) {
    member.isMuted = true;
    member.mutedUntil = new Date(Date.now() + duration);
    await this.save();
  }
};

module.exports = mongoose.model('GroupChat', groupChatSchema);