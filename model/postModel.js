const mongoose = require('mongoose');

// Reply Schema
const replySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  text: {
    type: String,
    required: true,
    maxlength: [300, 'Reply cannot exceed 300 characters'],
    trim: true
  },
  isHidden: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Comment Schema
const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  text: {
    type: String,
    required: true,
    maxlength: [300, 'Comment cannot exceed 300 characters'],
    trim: true
  },
  isHidden: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  replies: [replySchema]
});

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
    tags: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
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
    visibility: {
      type: String,
      enum: ['public', 'followers', 'private'],
      default: 'public'
    },
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      sparse: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0]
      }
    },
    category: {
      type: String,
      enum: ['general', 'event', 'job', 'announcement'],
      default: 'general'
    },
    reportCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
postSchema.index({ createdAt: -1 });
postSchema.index({ location: '2dsphere' });
postSchema.index({ tags: 1 });
postSchema.index({ community: 1, createdAt: -1 });
postSchema.index({ category: 1, createdAt: -1 });
postSchema.index({ 'comments.createdAt': -1 });

// Virtuals
postSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

postSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Methods
postSchema.methods.isLikedBy = function(userId) {
  return this.likes.includes(userId);
};

postSchema.methods.toggleLike = async function(userId) {
  const index = this.likes.indexOf(userId);
  if (index === -1) {
    this.likes.push(userId);
  } else {
    this.likes.splice(index, 1);
  }
  await this.save();
  return index === -1; // returns true if liked, false if unliked
};

postSchema.methods.addComment = async function(userId, text) {
  this.comments.push({ user: userId, text });
  await this.save();
  return this.comments[this.comments.length - 1];
};

postSchema.methods.addReply = async function(commentId, userId, text) {
  const comment = this.comments.id(commentId);
  if (!comment) throw new Error('Comment not found');
  
  comment.replies.push({ user: userId, text });
  await this.save();
  return comment.replies[comment.replies.length - 1];
};

// Middleware
postSchema.pre('save', function(next) {
  // Ensure media array is not empty when post is created
  if (this.isNew && (!this.media || this.media.length === 0) && !this.caption) {
    next(new Error('Post must have either media or caption'));
  }
  next();
});

const Post = mongoose.model('Post', postSchema);

module.exports = Post;