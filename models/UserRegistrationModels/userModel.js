const mongoose = require('mongoose');
const validator = require('validator');
const { hashPassword, isPasswordMatched } = require('../../helpers/userHelpers');

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: [2, 'First name must be at least 2 characters long'],
      maxlength: [30, 'First name cannot exceed 30 characters']
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: [2, 'Last name must be at least 2 characters long'],
      maxlength: [30, 'Last name cannot exceed 30 characters']
    },
    fullName: {
      type: String,
      required: false,
    },
    birthDate: {
      type: Date,
      required: [true, 'Birth date is required'],
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      required: [true, 'Gender is required'],
    },
    phoneNumber: {
      type: String,
      validate: {
        validator: function (v) {
          return /\d{10}/.test(v);
        },
        message: props => `${props.value} is not a valid phone number!`
      },
      required: [true, 'Phone number is required'],
      
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
    },
    state: {
      type: String,
      required: [true, 'State is required'],
    },
    district: {
      type: String,
      required: [true, 'District is required'],
    },
    profilePicture: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      maxlength: [200, 'Bio cannot exceed 200 characters'],
    },
    privacy: {
      type: String,
      default: 'public',
    },
    lastLogin: {
      type: Date,
      default: null
    },
    jainAadharNumber: {
      type: String,
    },
    jainAadharStatus: {
      type: String,
      enum: ['none', 'pending', 'verified', 'rejected'],
      default: 'none'
    },
    jainAadharApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JainAadhar'
    },
    trialPeriodStart: {
      type: Date,
      default: Date.now
    },
    trialPeriodEnd: {
      type: Date,
      default: function() {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        return date;
      }
    },
    isTrialExpired: {
      type: Boolean,
      default: false
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'superadmin'],
      default: 'user'
    },
    adminVerifiedAt: {
      type: Date
    },
    adminPermissions: [{
      type: String,
      enum: [
        'manage_users',
        'verify_jain_aadhar',
        'manage_content',
        'manage_reports'
      ]
    }],
    posts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        default: 0,
      },
    ],
    likedPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
      },
    ],
    story: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story',
      },
    ],
    token: {
      type: String,
      default: null
    },
    deletedAt: { type: Date },
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date,
      default: null
    },
    sanghRoles: [{
      sanghId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sangh'
      },
      role: {
        type: String,
        enum: ['president', 'secretary', 'treasurer', 'member']
      },
      level: {
        type: String,
        enum: ['city', 'district', 'state', 'country']
      }
    }]
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', hashPassword);
userSchema.methods.isPasswordMatched = isPasswordMatched;

// Update indexes to match schema changes
userSchema.index({ phoneNumber: 1 }); 
userSchema.index({ jainAadharNumber: 1 }, { sparse: true }); 
userSchema.index({ jainAadharStatus: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

// Add compound indexes for common query patterns
userSchema.index({ role: 1, createdAt: -1 }); 
userSchema.index({ jainAadharStatus: 1, createdAt: -1 }); 

userSchema.methods.incrementLoginAttempts = async function() {
    this.loginAttempts += 1;
    if (this.loginAttempts >= 5) {
        this.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lock
    }
    await this.save();
};

module.exports = mongoose.model('User', userSchema);