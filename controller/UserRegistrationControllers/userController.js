const User = require("../../model/UserRegistrationModels/userModel");
const asyncHandler = require("express-async-handler");
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const dotenv = require("dotenv").config();
const { userValidation } = require('../../validators/validations');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: { success: false, error: 'Too many login attempts. Please try again later.' }
});

// Generate JWT Token
const generateToken = (user) => {
    return jwt.sign(
        {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName
        },
        process.env.JWT_SECRET,
        { algorithm: 'HS256' }
    );
};

// Register new user with enhanced security
const registerUser = [
    userValidation.register,
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array().map(err => ({ field: err.param, message: err.msg }))
            });
        }

        const { firstName, lastName, phoneNumber, password, birthDate, gender, city } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ phoneNumber });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                error: 'User with this phone number already exists'
            });
        }

        // Enhanced name formatting
        const fullName = lastName.toLowerCase() === 'jain' 
            ? `${firstName} Jain`
            : `${firstName} Jain (${lastName})`;

        const newUser = await User.create({
            firstName,
            lastName,
            fullName,
            phoneNumber,
            password,
            birthDate,
            gender,
            city,
            lastLogin: new Date(),
            accountStatus: 'active',
            registrationStep: 'initial' // Track registration progress
        });

        const token = generateToken(newUser);
        newUser.token = token;
        await newUser.save();

        const userResponse = newUser.toObject();
        delete userResponse.password;
        delete userResponse.__v;

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: userResponse,
            token,
            nextStep: 'profile_picture' 
        });
    })
];

// Enhanced login with rate limiting and security
const loginUser = [
    authLimiter,
    userValidation.login,
    asyncHandler(async (req, res) => {
        const { fullName, password } = req.body;
        
        try {
            // Split fullName into firstName and lastName
            const [firstName, ...lastNameParts] = fullName.split(' ');
            const lastName = lastNameParts.join(' ');

            if (!firstName || !lastName) {
                return res.status(400).json({
                    success: false,
                    message: "Please enter your full name"
                });
            }

            // Find user by firstName and lastName
            const user = await User.findOne({ 
                firstName: new RegExp(`^${firstName}$`, 'i'),
                lastName: new RegExp(`^${lastName}$`, 'i')
            });
            
            if (!user || !(await user.isPasswordMatched(password))) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid full name or password"
                });
            }

            const token = generateToken(user);
            user.token = token;
            user.lastLogin = new Date();
            await user.save();

            const userResponse = user.toObject();
            delete userResponse.password;
            delete userResponse.__v;

            res.json({
                success: true,
                message: "Login successful",
                data: {
                    user: userResponse,
                    token
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Login failed",
                error: error.message
            });
        }
    })
];

// Enhanced user search with pagination and filters
const getAllUsers = asyncHandler(async (req, res) => {
    const { search, page = 1, limit = 10, city, gender } = req.query;
    const skip = (page - 1) * limit;

    let query = {};

    if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { fullName: searchRegex }
        ];
    }

    if (city) query.city = new RegExp(city, 'i');
    if (gender) query.gender = gender;

    const users = await User.find(query)
        .select('-password -__v')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
        success: true,
        users,
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total
    });
});

// Enhanced user profile retrieval
const getUserById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const user = await User.findById(id)
        .select('-password -__v')
        .populate({
            path: 'posts',
            select: '-__v',
            options: { sort: { createdAt: -1 } }
        })
        .populate('story', 'content createdAt');

    if (!user) {
        return res.status(404).json({ 
            success: false,
            error: 'User not found'
        });
    }

    const userResponse = user.toObject();
    userResponse.postCount = user.posts.length;

    res.json({
        success: true,
        user: userResponse
    });
});

// Enhanced user update with validation
const updateUserById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Prevent updating sensitive fields
    delete updates.password;
    delete updates.token;

    const user = await User.findById(id);
    if (!user) {
        return res.status(404).json({ 
            success: false,
            error: 'User not found'
        });
    }

    // Validate updates
    if (updates.phoneNumber && !/^\d{10}$/.test(updates.phoneNumber)) {
        return res.status(400).json({ 
            success: false,
            error: 'Invalid phone number format'
        });
    }

    const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    ).select('-password -__v');

    res.json({
        success: true,
        user: updatedUser
    });
});

// Enhanced privacy settings
const updatePrivacy = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(
        id,
        { privacy: 'public' },
        { new: true }
    ).select('-password -__v');

    if (!user) {
        return res.status(404).json({ 
            success: false,
            error: 'User not found'
        });
    }

    res.json({
        success: true,
        message: 'Privacy settings updated successfully',
        user
    });
});

// Upload profile picture with registration step tracking
const uploadProfilePicture = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;
        let imageUrl = null;

        if (req.file) {
            imageUrl = req.file.location; // S3 URL of the uploaded file
        }

        const updateData = {
            registrationStep: 'completed',
            ...(imageUrl && { profilePicture: imageUrl })
        };

        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        ).select('-password -__v');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: imageUrl ? 'Profile picture uploaded successfully' : 'Profile picture upload skipped',
            data: {
                user,
                registrationComplete: true
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error processing profile picture',
            details: error.message
        });
    }
});

// Skip profile picture upload
const skipProfilePicture = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;
        
        const user = await User.findByIdAndUpdate(
            userId,
            { registrationStep: 'completed' },
            { new: true }
        ).select('-password -__v');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Profile picture upload skipped',
            data: {
                user,
                registrationComplete: true
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error skipping profile picture',
            details: error.message
        });
    }
});

// Update the logoutUser function
const logoutUser = asyncHandler(async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Clear the token
        user.token = null;
        await user.save();

        res.json({
            success: true,
            message: "Logged out successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Logout failed",
            error: error.message
        });
    }
});

module.exports = {
    registerUser,
    loginUser,
    getAllUsers,
    getUserById,
    updateUserById,
    updatePrivacy,
    uploadProfilePicture,
    skipProfilePicture,
    logoutUser
};