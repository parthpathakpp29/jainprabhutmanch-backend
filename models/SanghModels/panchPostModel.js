const mongoose = require('mongoose');

// Create a reusable reply schema
const replySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

// Create a reusable comment schema
const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: [500, 'Comment cannot exceed 500 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  replies: [replySchema]
}, { _id: true });

const panchPostSchema = new mongoose.Schema({
  panchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Panch',
    required: true
  },
  sanghId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HierarchicalSangh',
    required: true
  },
  postedByMemberId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  postedByName: {
    type: String,
    required: true
  },
  caption: {
    type: String,
    required: true,
    trim: true,
    maxlength: [2000, 'Caption cannot exceed 2000 characters']
  },
  media: [{
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['image', 'video'],
      required: true
    }
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [commentSchema],
  isHidden: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add indexes for optimized queries
panchPostSchema.index({ panchId: 1, createdAt: -1 }); // For Panch's posts feed
panchPostSchema.index({ createdAt: -1 }); // For global feed
panchPostSchema.index({ 'comments.user': 1 }); // For finding user's comments
panchPostSchema.index({ likes: 1 }); // For finding posts liked by a user
panchPostSchema.index({ isHidden: 1, createdAt: -1 }); // For filtering hidden posts
panchPostSchema.index({ postedByMemberId: 1, createdAt: -1 }); // For finding posts by specific user

// Virtuals
panchPostSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

panchPostSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Methods
panchPostSchema.methods.isLikedBy = function(userId) {
  return this.likes.some(id => id.toString() === userId.toString());
};

panchPostSchema.methods.toggleLike = function(userId) {
  const isLiked = this.isLikedBy(userId);

  if (isLiked) {
    this.likes = this.likes.filter(id => id.toString() !== userId.toString());
  } else {
    this.likes.push(userId);
  }

  return { isLiked: !isLiked, likeCount: this.likes.length };
};

panchPostSchema.methods.addComment = function(userId, text) {
  const comment = {
    user: userId,
    text,
    createdAt: new Date(),
    replies: []
  };

  this.comments.push(comment);
  return comment;
};

module.exports = mongoose.model('PanchPost', panchPostSchema);