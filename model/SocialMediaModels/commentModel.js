const mongoose = require('mongoose');

// Reply Schema
const replySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true, maxlength: [300, 'Reply cannot exceed 300 characters'], trim: true },
  isHidden: { type: Boolean, default: false },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Allow users to like replies
  reportCount: { type: Number, default: 0 }, // Track reported replies
  deletedAt: { type: Date }, // Soft deletion field
  createdAt: { type: Date, default: Date.now, index: true },
});

// Comment Schema
const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true, maxlength: [300, 'Comment cannot exceed 300 characters'], trim: true },
  isHidden: { type: Boolean, default: false },
  replies: [replySchema],
  // likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Allow users to like comments
  deletedAt: { type: Date }, // Soft deletion field
  createdAt: { type: Date, default: Date.now, index: true },
 
});

// Methods
commentSchema.methods.addReply = function(userId, text) {
  this.replies.push({ user: userId, text });
  return this;
};

module.exports = {
  Comment: mongoose.model('Comment', commentSchema),
  commentSchema,
  replySchema,
};