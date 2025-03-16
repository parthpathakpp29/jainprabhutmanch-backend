const mongoose = require('mongoose');

const sanghPostSchema = new mongoose.Schema({
  sanghId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HierarchicalSangh',
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
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: [2000, 'Content cannot exceed 2000 characters']
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
  comments: [{
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
    }
  }],
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
sanghPostSchema.index({ sanghId: 1, createdAt: -1 });
sanghPostSchema.index({ postedByUserId: 1 });
sanghPostSchema.index({ createdAt: -1 });
sanghPostSchema.index({ isHidden: 1 });

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
    createdAt: new Date()
  };

  this.comments.push(comment);
  return comment;
};

module.exports = mongoose.model('SanghPost', sanghPostSchema); 