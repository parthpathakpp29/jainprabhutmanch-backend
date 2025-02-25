const User = require('../model/userModel'); // Adjust the path to match your project structure
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const dotenv = require("dotenv").config();

// Log middleware function
const logMiddleware = (req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
};

// Authenticate middleware function
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];
  
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: 'Invalid token' });
      }
      req.user = decoded;
      next();
    });
};

// Auth middleware function
const authMiddleware = asyncHandler(async (req, res, next) => {
    let token;
    const secretKey = process.env.JWT_SECRET;

    if (req?.headers?.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(" ")[1];
        try {
            if (token) {
                const decoded = jwt.verify(token, secretKey);
                const user = await User.findById(decoded?._id).select('-password -__v');
                if (!user) {
                    return res.status(401).json({ 
                        success: false, 
                        message: "User not found." 
                    });
                }
                req.user = user;
                next();
            } else {
                return res.status(401).json({ 
                    success: false, 
                    message: "Invalid token." 
                });
            }
        } catch (error) {
            return res.status(401).json({ 
                success: false, 
                message: "Token expired or invalid.",
                error: error.message 
            });
        }
    } else {
        return res.status(401).json({ 
            success: false, 
            message: "No token attached to headers" 
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