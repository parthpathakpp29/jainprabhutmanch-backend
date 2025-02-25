const mongoose = require('mongoose');
const validator = require('validator');
const { hashPassword, isPasswordMatched } = require('../helpers/userHelpers');

// Declare the Schema of the Mongo model
var userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: false,
    },
    birthDate: {
      type: Date,
      required: true,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      required: true,
    },
    phoneNumber: {
      type: String,
      validate: {
        validator: function (v) {
          return /\d{10}/.test(v);
        },
        message: props => `${props.value} is not a valid phone number!`
      },
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
    },
    city: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, 'Invalid email address'],
    },
    profilePicture: {
      type: String,
    },
    registrationStep: {
      type: String,
      enum: ['initial', 'completed'],
      default: 'initial'
    },
    jainAadharNumber: {
      type: String,
      sparse: true,
      unique: true
    },
    jainAadharStatus: {
      type: String,
      enum: ['none', 'pending', 'verified'],
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
    bio: {
      type: String,
      maxlength: 200,
    },
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
    friends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    privacy: {
      type: String,
      enum: ['public'],
      default: 'public',
    },
    story: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story',
      },
    ],
    token: {
      type: String,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', hashPassword);

userSchema.methods.isPasswordMatched = isPasswordMatched;

// Export the model
module.exports = mongoose.model('User', userSchema);