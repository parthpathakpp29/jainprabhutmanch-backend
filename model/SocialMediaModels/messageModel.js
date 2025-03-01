const mongoose = require('mongoose');
const crypto = require('crypto');

// Encryption configuration
const ENCRYPTION_KEY = process.env.MESSAGE_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

// Convert hex key to buffer of correct length
const getKeyBuffer = (hexKey) => {
  // Ensure the hex key is exactly 64 characters (32 bytes)
  const normalizedKey = hexKey.padEnd(64, '0').slice(0, 64);
  return Buffer.from(normalizedKey, 'hex');
};

// Encryption/Decryption functions
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKeyBuffer(ENCRYPTION_KEY);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

function decrypt(text) {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const key = getKeyBuffer(ENCRYPTION_KEY);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption error:', error);
    // If decryption fails, return the original text (for handling legacy messages)
    return text;
  }
}

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
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: false
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
// Add compound indexes for common query patterns
messageSchema.index({ conversation: 1, createdAt: -1 }); // For conversation history
messageSchema.index({ receiver: 1, isDeleted: 1, createdAt: -1 }); // For inbox queries
messageSchema.index({ sender: 1, isDeleted: 1, createdAt: -1 }); // For sent messages
// Add TTL index for auto-deleting messages after 1 year if needed
// messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

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

// Add pre-save middleware for encryption
messageSchema.pre('save', function(next) {
  if (this.isModified('message')) {
    this.message = encrypt(this.message);
  }
  next();
});

// Add post-find middleware for decryption
messageSchema.post('find', function(docs) {
  if (!Array.isArray(docs)) return;
  docs.forEach(doc => {
    if (doc.message) {
      doc.message = decrypt(doc.message);
    }
  });
});

messageSchema.post('findOne', function(doc) {
  if (doc && doc.message) {
    doc.message = decrypt(doc.message);
  }
});

// Add virtual for decrypted message
messageSchema.virtual('decryptedMessage').get(function() {
  return this.message ? decrypt(this.message) : '';
});

module.exports = mongoose.model('Message', messageSchema);