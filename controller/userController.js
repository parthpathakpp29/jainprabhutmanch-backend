const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const dotenv = require("dotenv").config();


const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, 
    message: { error: 'Too many login attempts. Please try again later.' }
});

const userValidation = {
    register: [
        body('firstName').notEmpty().trim().escape()
            .isLength({ min: 2, max: 30 }).withMessage('First name must be between 2 and 30 characters'),
        body('lastName').notEmpty().trim().escape()
            .isLength({ min: 2, max: 30 }).withMessage('Last name must be between 2 and 30 characters'),
        body('email').isEmail().normalizeEmail()
            .custom(async (email) => {
                const user = await User.findOne({ email });
                if (user) throw new Error('Email already registered');
            }),
        body('phoneNumber').matches(/^\d{10}$/).withMessage('Phone number must be 10 digits'),
        body('password')
            .isLength({ min: 8 })
            .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])/)
            .withMessage('Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character'),
        body('birthDate').isISO8601().withMessage('Invalid date format'),
        body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Invalid gender value'),
        body('city').notEmpty().trim().escape(),
    ]
};

// Generate JWT Token
const generateToken = (user) => {
    return jwt.sign(
        {
            _id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
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
                errors: errors.array() // Fixed typo here
            });
        }

        const { firstName, lastName, email, phoneNumber, password, birthDate, gender, city } = req.body;

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
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
            email,
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
            nextStep: 'profile_picture' // Indicate next step in registration
        });
    })
];

// Enhanced login with rate limiting and security
const loginUser = [
    authLimiter,
    body('fullName').notEmpty().withMessage('Full name is required').trim().escape(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long').trim().escape(),

    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { fullName, password } = req.body;
        const [firstName, ...lastNameArray] = fullName.split(' ');
        const lastName = lastNameArray.join(' ');

        if (!firstName || !lastName) {
            return res.status(400).json({ error: 'Full name must include both first and last names' });
        }

        const user = await User.findOne({ firstName, lastName }).select('+password');
        
        if (!user || !(await user.isPasswordMatched(password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login time
        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user);

        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.__v;

        res.json({
            message: 'Login successful',
            user: userResponse,
            token
        });
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
            { fullName: searchRegex },
            { email: searchRegex }
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
        .populate('friends', 'fullName email profilePicture')
        .populate({
            path: 'posts',
            select: '-__v',
            options: { sort: { createdAt: -1 } }
        })
        .populate('story', 'content createdAt');

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const userResponse = user.toObject();
    userResponse.friendCount = user.friends.length;
    userResponse.postCount = user.posts.length;

    res.json(userResponse);
});

// Enhanced user update with validation
const updateUserById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Prevent updating sensitive fields
    delete updates.password;
    delete updates.email;
    delete updates.token;

    const user = await User.findById(id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Validate updates
    if (updates.phoneNumber && !/^\d{10}$/.test(updates.phoneNumber)) {
        return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    ).select('-password -__v');

    res.json(updatedUser);
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
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({
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
                message: 'User not found'
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
            message: 'Error processing profile picture',
            error: error.message
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
                message: 'User not found'
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
            message: 'Error skipping profile picture',
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
    skipProfilePicture
};