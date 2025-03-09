const express = require('express');
const { createStory, getAllStories, getStoriesByUser, deleteStory } = require('../../controllers/SocialMediaControllers/storyController');
const upload = require('../../middlewares/uploadMiddleware');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const { param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Protected routes
router.use(authMiddleware);

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

// Rate limiting for story creation to prevent spam
const storyCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // limit each user to 10 stories per hour
    message: {
        success: false,
        message: 'Too many stories created. Please try again later.'
    },
    standardHeaders: true,
    keyGenerator: (req) => req.user ? req.user.id : req.ip
});

// Story routes
router.post("/", 
    storyCreationLimiter,
    upload.storyUpload,
    createStory
);

router.get('/get', getAllStories); 

router.get('/:userId', 
    [
        param('userId').isMongoId().withMessage('Invalid user ID')
    ],
    validateRequest,
    getStoriesByUser
);

router.delete('/delete/:userId/:storyId', 
    [
        param('userId').isMongoId().withMessage('Invalid user ID'),
        param('storyId').isMongoId().withMessage('Invalid story ID')
    ],
    validateRequest,
    deleteStory
);

module.exports = router;