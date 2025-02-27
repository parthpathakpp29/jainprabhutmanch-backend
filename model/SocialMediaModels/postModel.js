const mongoose = require('mongoose');
const { commentSchema } = require('./commentModel');

// Post Schema
const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    caption: {
      type: String,
      maxlength: [2000, 'Caption cannot exceed 2000 characters'],
      trim: true
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
      },
      thumbnail: {
        type: String
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
    },
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      sparse: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes - grouped for better readability
postSchema.index({ createdAt: -1 });
postSchema.index({ community: 1, createdAt: -1 });
postSchema.index({ 'comments.createdAt': -1 });

// Virtuals
postSchema.virtual('likeCount').get(function () {
  return this.likes.length;
});

postSchema.virtual('commentCount').get(function () {
  return this.comments.length;
});

// Methods
postSchema.methods.isLikedBy = function (userId) {
  return this.likes.some(id => id.toString() === userId.toString());
};

postSchema.methods.toggleLike = function (userId) {
  const isLiked = this.isLikedBy(userId);

  if (isLiked) {
    this.likes = this.likes.filter(id => id.toString() !== userId.toString());
  } else {
    this.likes.push(userId);
  }

  return { isLiked: !isLiked, likeCount: this.likes.length };
};

postSchema.methods.addComment = function (userId, text) {
  const comment = {
    user: userId,
    text,
    createdAt: new Date()
  };

  this.comments.push(comment);
  return comment;
};

postSchema.methods.findComment = function (commentId) {
  return this.comments.id(commentId);
};

const Post = mongoose.model('Post', postSchema);
module.exports = Post;