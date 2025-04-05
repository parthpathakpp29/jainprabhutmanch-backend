const User = require("../../models/UserRegistrationModels/userModel");
const asyncHandler = require("express-async-handler");
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const dotenv = require("dotenv").config();
const { userValidation } = require('../../validators/validations');
const { generateToken } = require('../../helpers/authHelpers');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../../services/nodemailerEmailService');

const crypto = require('crypto');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Too many login attempts. Please try again later.' }
});

// Generate a random 6-digit code
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register new user with enhanced security and email verification
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
            email,
            phoneNumber,
            password,
            birthDate,
            gender,
            city,
            state,
            district
        } = req.body;

        // Check if user already exists
        const existingUserByPhone = await User.findOne({ phoneNumber });
        if (existingUserByPhone) {
            return errorResponse(res, 'User with this phone number already exists', 400);
        }

        const existingUserByEmail = await User.findOne({ email });

        if (existingUserByEmail) {
            if (existingUserByEmail.isEmailVerified) {
                return errorResponse(res, 'User with this email already exists', 400);
            }

            // 💡 Delete old unverified user to allow clean re-registration
            await User.deleteOne({ _id: existingUserByEmail._id });
        }


        // Generate verification code
        const verificationCode = generateVerificationCode();
        const codeExpiry = new Date();
        codeExpiry.setMinutes(codeExpiry.getMinutes() + 30); // Code expires in 30 minutes

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
            state,
            district,
            verificationCode: {
                code: verificationCode,
                expiresAt: codeExpiry
            },
            lastLogin: new Date(),
            accountStatus: 'active',
            registrationStep: 'verification_pending'
        });

        // Send verification email
        try {
            await sendVerificationEmail(email, firstName, verificationCode);


        } catch (error) {
            // Don't fail registration if email fails, but log the error
            console.error('Error sending verification email:', error);
        }

        const userResponse = newUser.toObject();
        delete userResponse.password;
        delete userResponse.__v;
        delete userResponse.verificationCode;

        return successResponse(
            res,
            {
                user: userResponse,
                nextStep: 'verify_email'
            },
            'User registered successfully. Please verify your email.',
            201
        );
    })
];

// Verify email with verification code
const verifyEmail = asyncHandler(async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
        return errorResponse(res, 'Email and verification code are required', 400);
    }

    const user = await User.findOne({ email });

    if (!user) {
        return errorResponse(res, 'User not found', 404);
    }

    if (user.isEmailVerified) {
        return errorResponse(res, 'Email is already verified', 400);
    }

    if (!user.verificationCode || !user.verificationCode.code) {
        return errorResponse(res, 'Verification code not found. Please request a new one.', 400);
    }

    if (new Date() > user.verificationCode.expiresAt) {
        return errorResponse(res, 'Verification code has expired. Please request a new one.', 400);
    }

    if (user.verificationCode.code !== code) {
        return errorResponse(res, 'Invalid verification code', 400);
    }

    // Mark email as verified and clear verification code
    user.isEmailVerified = true;
    user.verificationCode = undefined;
    user.registrationStep = 'initial';

    const token = generateToken(user);
    user.token = token;
    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.__v;

    return successResponse(
        res,
        {
            user: userResponse,
            token,
            nextStep: 'profile_picture'
        },
        'Email verified successfully',
        200
    );
});

// Resend verification code
const resendVerificationCode = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return errorResponse(res, 'Email is required', 400);
    }

    const user = await User.findOne({ email });

    if (!user) {
        return errorResponse(res, 'User not found', 404);
    }

    if (user.isEmailVerified) {
        return errorResponse(res, 'Email is already verified', 400);
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    const codeExpiry = new Date();
    codeExpiry.setMinutes(codeExpiry.getMinutes() + 30); // Code expires in 30 minutes

    user.verificationCode = {
        code: verificationCode,
        expiresAt: codeExpiry
    };
    await user.save();

    // Send verification email
    try {
        await sendVerificationEmail(email, user.firstName, verificationCode);
    } catch (error) {
        return errorResponse(res, 'Failed to send verification email', 500);
    }

    return successResponse(
        res,
        {},
        'Verification code resent successfully',
        200
    );
});

// Request password reset
const requestPasswordReset = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return errorResponse(res, 'Email is required', 400);
    }

    const user = await User.findOne({ email });

    // Security-friendly response
    if (!user) {
        return successResponse(res, {}, 'If your email is registered, you will receive a password reset code');
    }

    // ✅ Add this check
    if (!user.isEmailVerified) {
        return errorResponse(res, 'Please verify your email before resetting your password', 403);
    }

    // Continue generating code
    const resetCode = generateVerificationCode();
    const codeExpiry = new Date();
    codeExpiry.setMinutes(codeExpiry.getMinutes() + 30);

    user.resetPasswordCode = {
        code: resetCode,
        expiresAt: codeExpiry
    };
    await user.save();

    try {
        await sendPasswordResetEmail(email, user.firstName, resetCode);
    } catch (error) {
        console.error('Error sending password reset email:', error);
        return errorResponse(res, 'Failed to send password reset email', 500);
    }

    return successResponse(res, {}, 'Password reset code has been sent to your email');
});


// Verify reset code and reset password
const resetPassword = asyncHandler(async (req, res) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
        return errorResponse(res, 'Email, reset code, and new password are required', 400);
    }

    const user = await User.findOne({ email });

    if (!user) {
        return errorResponse(res, 'User not found', 404);
    }

    if (!user.resetPasswordCode || !user.resetPasswordCode.code) {
        return errorResponse(res, 'Reset code not found. Please request a new one.', 400);
    }

    if (new Date() > user.resetPasswordCode.expiresAt) {
        return errorResponse(res, 'Reset code has expired. Please request a new one.', 400);
    }

    if (user.resetPasswordCode.code !== code) {
        return errorResponse(res, 'Invalid reset code', 400);
    }

    // Update password and clear reset code
    user.password = newPassword;
    user.resetPasswordCode = undefined;
    await user.save();

    return successResponse(
        res,
        {},
        'Password has been reset successfully',
        200
    );
});

// Enhanced login with rate limiting and security
const loginUser = [
    authLimiter,
    userValidation.login,
    asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        try {
            const user = await User.findOne({ email });

            if (!user || !(await user.isPasswordMatched(password))) {
                return errorResponse(res, "Invalid email or password", 401);
            }

            if (!user.isEmailVerified) {
                return errorResponse(res, "Please verify your email before logging in", 401, {
                    requiresEmailVerification: true
                });
            }

            // Generate tokens
            const token = generateToken(user);
            user.token = token;
            user.lastLogin = new Date();
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
            { fullName: searchRegex },
            { email: searchRegex }
        ];
    }

    if (city) query.city = new RegExp(city, 'i');
    if (state) query.state = new RegExp(state, 'i');
    if (district) query.district = new RegExp(district, 'i');
    if (gender) query.gender = gender;

    const users = await User.find(query)
        .select('-password -__v -verificationCode -resetPasswordCode')
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
        .select('-password -__v -verificationCode -resetPasswordCode')
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
    delete updates.isEmailVerified;
    delete updates.verificationCode;
    delete updates.resetPasswordCode;

    const user = await User.findById(id);
    if (!user) {
        return errorResponse(res, 'User not found', 404);
    }

    // Validate updates
    if (updates.phoneNumber && !/^\d{10}$/.test(updates.phoneNumber)) {
        return errorResponse(res, 'Invalid phone number format', 400);
    }

    // Check if email is being updated
    if (updates.email && updates.email !== user.email) {
        // Check if the new email is already in use
        const existingUser = await User.findOne({ email: updates.email });
        if (existingUser) {
            return errorResponse(res, 'Email is already in use', 400);
        }

        // Require re-verification for new email
        const verificationCode = generateVerificationCode();
        const codeExpiry = new Date();
        codeExpiry.setMinutes(codeExpiry.getMinutes() + 30);

        updates.isEmailVerified = false;
        updates.verificationCode = {
            code: verificationCode,
            expiresAt: codeExpiry
        };

        // Send verification email to new address
        try {
            await sendVerificationEmail(updates.email, user.firstName, verificationCode);
        } catch (error) {
            console.error('Error sending verification email:', error);
            // Continue with update even if email fails
        }
    }

    const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    ).select('-password -__v -verificationCode -resetPasswordCode');

    return successResponse(
        res,
        {
            user: updatedUser,
            emailVerificationRequired: updates.email && updates.email !== user.email
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
        ).select('-password -__v -verificationCode -resetPasswordCode');

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
        ).select('-password -__v -verificationCode -resetPasswordCode');

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

// Search users by name, email, or phone - for suggestion/complaint recipient selection
const searchUsers = asyncHandler(async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.length < 3) {
            return errorResponse(res, 'Search query must be at least 3 characters', 400);
        }

        const users = await User.find({
            $or: [
                { firstName: { $regex: query, $options: 'i' } },
                { lastName: { $regex: query, $options: 'i' } },
                { phoneNumber: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } }
            ]
        }).select('_id firstName lastName phoneNumber email roles profilePicture')
            .limit(10);

        // Format user data for frontend
        const formattedUsers = users.map(user => ({
            _id: user._id,
            name: `${user.firstName} ${user.lastName}`,
            phone: user.phoneNumber,
            email: user.email || '',
            roles: user.roles || [],
            profilePicture: user.profilePicture || ''
        }));

        return successResponse(res, formattedUsers, 'Users retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
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
    logoutUser,
    searchUsers,
    verifyEmail,
    resendVerificationCode,
    requestPasswordReset,
    resetPassword
};
