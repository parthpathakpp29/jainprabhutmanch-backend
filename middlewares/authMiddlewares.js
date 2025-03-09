const User = require('../models/UserRegistrationModels/userModel'); 
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const dotenv = require("dotenv").config();

// Log middleware function
const logMiddleware = (req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
};

// Authenticate middleware function
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded._id);

      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      if (token !== user.token) {
        return res.status(401).json({ message: 'Invalid token' });
      }

      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      throw error;
    }
  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Auth middleware function
const authMiddleware = asyncHandler(async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "No token attached to headers"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded._id)
            .select('-password -__v');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        // Check if token matches stored token
        if (token !== user.token) {
            return res.status(401).json({
                success: false,
                message: "Session expired or invalid. Please login again."
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Authentication failed",
            error: error.message
        });
    }
});

// Admin middleware
const isAdmin = asyncHandler(async (req, res, next) => {
    const user = req.user;
    if (user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin privileges required.'
        });
    }
    next();
});

// Check trial period or Jain Aadhar verification
const checkAccess = asyncHandler(async (req, res, next) => {
    const user = req.user;
    const currentDate = new Date();

    // If user is verified with Jain Aadhar, allow access
    if (user.jainAadharStatus === 'verified') {
        return next();
    }

    // If trial period has not expired, allow access
    if (user.trialPeriodEnd && new Date(user.trialPeriodEnd) > currentDate) {
        return next();
    }

    // If user has pending Jain Aadhar verification, allow limited access
    if (user.jainAadharStatus === 'pending') {
        return res.status(403).json({
            success: false,
            message: 'Your Jain Aadhar verification is pending. Some features may be limited.',
            status: 'pending'
        });
    }

    // If trial period has expired and no Jain Aadhar verification
    return res.status(403).json({
        success: false,
        message: 'Trial period expired. Please verify your Jain Aadhar to continue using all features.',
        status: 'expired'
    });
});

module.exports = {
    logMiddleware,
    authMiddleware,
    authenticate,
    isAdmin,
    checkAccess
};