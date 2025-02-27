const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  following: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now, index: true },
});

friendshipSchema.pre('save', function(next) {
  if (this.follower.equals(this.following)) {
    next(new Error('You cannot follow yourself'));
  } else {
    next();
  }
});

module.exports = mongoose.model('Friendship', friendshipSchema);