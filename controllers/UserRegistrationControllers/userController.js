const User = require("../../models/UserRegistrationModels/userModel");
const asyncHandler = require("express-async-handler");
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const dotenv = require("dotenv").config();
const { userValidation } = require('../../validators/validations');
const { generateToken } = require('../../helpers/authHelpers');
const { successResponse, errorResponse } = require('../../utils/apiResponse');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: { success: false, error: 'Too many login attempts. Please try again later.' }
});

// Register new user with enhanced security
const registerUser = [
    userValidation.register,
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return errorResponse(
                res, 
                'Validation failed', 
                400, 
                errors.array().map(err => ({ field: err.param, message: err.msg }))
            );
        }

        const { 
            firstName, 
            lastName, 
            phoneNumber, 
            password, 
            birthDate, 
            gender, 
            city,
            state,
            district 
        } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ phoneNumber });
        if (existingUser) {
            return errorResponse(res, 'User with this phone number already exists', 400);
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
            state,
            district,
            lastLogin: new Date(),
            accountStatus: 'active',
            registrationStep: 'initial'
        });

        const token = generateToken(newUser);
        newUser.token = token;
        await newUser.save();

        const userResponse = newUser.toObject();
        delete userResponse.password;
        delete userResponse.__v;

        return successResponse(
            res, 
            {
                user: userResponse,
                token,
                nextStep: 'profile_picture' 
            },
            'User registered successfully',
            201
        );
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
                return errorResponse(res, "Please enter your full name", 400);
            }

            // Find user by firstName and lastName
            const user = await User.findOne({ 
                firstName: new RegExp(`^${firstName}$`, 'i'),
                lastName: new RegExp(`^${lastName}$`, 'i')
            });
            
            if (!user || !(await user.isPasswordMatched(password))) {
                return errorResponse(res, "Invalid full name or password", 401);
            }

            // Generate tokens
            const token = generateToken(user);
            user.token = token;
            await user.save();

            const userResponse = user.toObject();
            delete userResponse.password;
            delete userResponse.__v;

            // Prepare role information for the response
            const roleInfo = {
                hasSanghRoles: user.sanghRoles && user.sanghRoles.length > 0,
                hasPanchRoles: user.panchRoles && user.panchRoles.length > 0,
                hasTirthRoles: user.tirthRoles && user.tirthRoles.length > 0,
                hasVyaparRoles: user.vyaparRoles && user.vyaparRoles.length > 0
            };

            return successResponse(
                res, 
                {
                    user: userResponse,
                    token: token,
                    roles: roleInfo
                },
                "Login successful",
                200
            );
        } catch (error) {
            return errorResponse(res, "Login failed", 500, error.message);
        }
    })
];

// Enhanced user search with pagination and filters
const getAllUsers = asyncHandler(async (req, res) => {
    const { search, page = 1, limit = 10, city, state, district, gender } = req.query;
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
    if (state) query.state = new RegExp(state, 'i');
    if (district) query.district = new RegExp(district, 'i');
    if (gender) query.gender = gender;

    const users = await User.find(query)
        .select('-password -__v')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    return successResponse(
        res, 
        {
            users,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalUsers: total
        },
        'Users retrieved successfully',
        200
    );
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
        return errorResponse(res, 'User not found', 404);
    }

    const userResponse = user.toObject();
    userResponse.postCount = user.posts.length;

    return successResponse(
        res, 
        {
            user: userResponse
        },
        'User retrieved successfully',
        200
    );
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
        return errorResponse(res, 'User not found', 404);
    }

    // Validate updates
    if (updates.phoneNumber && !/^\d{10}$/.test(updates.phoneNumber)) {
        return errorResponse(res, 'Invalid phone number format', 400);
    }

    const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    ).select('-password -__v');

    return successResponse(
        res, 
        {
            user: updatedUser
        },
        'User updated successfully',
        200
    );
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
            return errorResponse(res, 'User not found', 404);
        }

        return successResponse(
            res, 
            {
                user,
                registrationComplete: true
            },
            imageUrl ? 'Profile picture uploaded successfully' : 'Profile picture upload skipped',
            200
        );
    } catch (error) {
        return errorResponse(res, 'Error processing profile picture', 500, error.message);
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
            return errorResponse(res, 'User not found', 404);
        }

        return successResponse(
            res, 
            {
                user,
                registrationComplete: true
            },
            'Profile picture upload skipped',
            200
        );
    } catch (error) {
        return errorResponse(res, 'Error skipping profile picture', 500, error.message);
    }
});

// Update the logoutUser function
const logoutUser = asyncHandler(async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return errorResponse(res, "User not found", 404);
        }

        // Clear tokens
        user.token = null;
        await user.save();

        return successResponse(
            res, 
            {},
            "Logged out successfully",
            200
        );
    } catch (error) {
        return errorResponse(res, "Logout failed", 500, error.message);
    }
});

module.exports = {
    registerUser,
    loginUser,
    getAllUsers,
    getUserById,
    updateUserById,
    uploadProfilePicture,
    skipProfilePicture,
    logoutUser
};