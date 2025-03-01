const express = require('express');
const { 
    followUser, 
    unfollowUser, 
    getFollowers, 
    getFollowing, 
    checkFollowStatus
} = require('../../controller/SocialMediaControllers/friendshipController');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const { check, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Apply authentication to all routes
router.use(authMiddleware);

// Rate limiting for follow/unfollow actions to prevent abuse
const followActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // limit each user to 30 follow/unfollow actions per 15 minutes
    message: {
        success: false,
        message: 'Too many follow/unfollow actions. Please try again later.'
    },
    standardHeaders: true,
    keyGenerator: (req) => req.user ? req.user.id : req.ip
});

// Validation middleware
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }
    next();
};

// Follow a user
router.post('/follow', 
    followActionLimiter,
    [
        check('followerId').isMongoId().withMessage('Invalid follower ID'),
        check('followingId').isMongoId().withMessage('Invalid following ID'),
        // Prevent self-following
        check('followingId').custom((value, { req }) => {
            if (value === req.body.followerId) {
                throw new Error('You cannot follow yourself');
            }
            return true;
        })
    ],
    validateRequest,
    followUser
);

// Unfollow a user
router.post('/unfollow', 
    followActionLimiter,
    [
        check('followerId').isMongoId().withMessage('Invalid follower ID'),
        check('followingId').isMongoId().withMessage('Invalid following ID')
    ],
    validateRequest,
    unfollowUser
);

// Get all followers of a user with pagination
router.get('/followers/:userId', 
    [
        param('userId').isMongoId().withMessage('Invalid user ID')
    ],
    validateRequest,
    getFollowers
);

// Get all users a user is following with pagination
router.get('/following/:userId', 
    [
        param('userId').isMongoId().withMessage('Invalid user ID')
    ],
    validateRequest,
    getFollowing
);

// Check follow status
router.post('/follow-status', 
    [
        check('followerId').isMongoId().withMessage('Invalid follower ID'),
        check('followingId').isMongoId().withMessage('Invalid following ID')
    ],
    validateRequest,
    checkFollowStatus
);

module.exports = router;