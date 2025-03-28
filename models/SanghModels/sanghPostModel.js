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

const sanghPostSchema = new mongoose.Schema({
  sanghId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HierarchicalSangh',
    required: true
  },
  sanghType: {
    type: String,
    enum: ['main', 'women', 'youth'],
    default: 'main',
    required: true
  },
  postedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  postedByRole: {
    type: String,
    enum: ['president', 'secretary', 'treasurer'],
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

// Indexes for better query performance
sanghPostSchema.index({ sanghId: 1, createdAt: -1 }); // For Sangh's posts feed
sanghPostSchema.index({ createdAt: -1 }); // For global feed
sanghPostSchema.index({ 'comments.user': 1 }); // For finding user's comments
sanghPostSchema.index({ likes: 1 }); // For finding posts liked by a user
sanghPostSchema.index({ isHidden: 1, createdAt: -1 }); // For filtering hidden posts
// sanghPostSchema.index({ postType: 1, createdAt: -1 }); // For filtering by post type (Commented out because postType field does not exist in the schema)

// Virtuals
sanghPostSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

sanghPostSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Methods
sanghPostSchema.methods.isLikedBy = function(userId) {
  return this.likes.some(id => id.toString() === userId.toString());
};

sanghPostSchema.methods.toggleLike = function(userId) {
  const isLiked = this.isLikedBy(userId);

  if (isLiked) {
    this.likes = this.likes.filter(id => id.toString() !== userId.toString());
  } else {
    this.likes.push(userId);
  }

  return { isLiked: !isLiked, likeCount: this.likes.length };
};

sanghPostSchema.methods.addComment = function(userId, text) {
  const comment = {
    user: userId,
    text,
    createdAt: new Date(),
    replies: []
  };

  this.comments.push(comment);
  return comment;
};

module.exports = mongoose.model('SanghPost', sanghPostSchema);