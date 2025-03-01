const mongoose = require('mongoose');

// Simplified Reply Schema
const replySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true, maxlength: [300, 'Reply cannot exceed 300 characters'], trim: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

// Simplified Comment Schema
const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true, maxlength: [300, 'Comment cannot exceed 300 characters'], trim: true },
  replies: [replySchema],
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