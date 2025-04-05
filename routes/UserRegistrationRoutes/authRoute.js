const express = require('express');
const { 
    registerUser, 
    getAllUsers, 
    getUserById, 
    updateUserById, 
    loginUser, 
    logoutUser,
    uploadProfilePicture,
    skipProfilePicture,
    searchUsers,
    verifyEmail,
    resendVerificationCode,
    requestPasswordReset,
    resetPassword
} = require('../../controllers/UserRegistrationControllers/userController');
const { authMiddleware, checkAccess } = require('../../middlewares/authMiddlewares');
const upload = require('../../middlewares/uploadMiddleware');
const { check, param, body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: {
        success: false,
        message: 'Too many login attempts. Please try again later.'
    }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 3, 
    message: {
        success: false,
        message: 'Too many registration attempts. Please try again later.'
    }
});

// Public routes
router.post('/register', 
    // registerLimiter,
    [
        body('firstName').trim().isLength({ min: 2, max: 30 }).withMessage('First name must be between 2 and 30 characters'),
        body('lastName').trim().isLength({ min: 2, max: 30 }).withMessage('Last name must be between 2 and 30 characters'),
        body('phoneNumber').matches(/\d{10}/).withMessage('Phone number must be 10 digits'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
        body('birthDate').isISO8601().withMessage('Invalid birth date format'),
        body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
        body('city').notEmpty().withMessage('City is required')
    ],
    registerUser
);

router.post('/login', 
    loginLimiter,
    [
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    loginUser
);

router.post('/verify-email', verifyEmail);
router.post('/resend-code', resendVerificationCode);

// Password reset
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);

// Protected routes
router.use(authMiddleware);

router.post('/logout', logoutUser);

// Routes that require additional access check
router.use(checkAccess);

router.get('/users', getAllUsers);

// Search users endpoint for suggestion/complaint recipient selection
router.get('/search', searchUsers);

router.get('/:id', 
    [
        param('id').isMongoId().withMessage('Invalid user ID')
    ],
    getUserById
);

router.put('/:id', 
    [
        param('id').isMongoId().withMessage('Invalid user ID'),
        body('firstName').optional().trim().isLength({ min: 2, max: 30 }).withMessage('First name must be between 2 and 30 characters'),
        body('lastName').optional().trim().isLength({ min: 2, max: 30 }).withMessage('Last name must be between 2 and 30 characters'),
        body('city').optional().notEmpty().withMessage('City cannot be empty'),
        body('bio').optional().isLength({ max: 200 }).withMessage('Bio cannot exceed 200 characters')
    ],
    updateUserById
);

router.post(
    '/upload-profile-picture',
    upload.single('profilePicture'),
    uploadProfilePicture
);

router.post(
    '/skip-profile-picture',
    skipProfilePicture
);



module.exports = router;