const express = require('express');
const { 
    registerUser, 
    getAllUsers, 
    getUserById, 
    updateUserById, 
    loginUser, 
    logoutUser,
    updatePrivacy,
    uploadProfilePicture,
    skipProfilePicture
} = require('../../controller/UserRegistrationControllers/userController');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const upload = require('../../middlewares/uploadMiddleware');

const router = express.Router();

// Auth routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/users', getAllUsers);
router.get('/:id', getUserById);
router.put('/:id', updateUserById);
router.put('/update-privacy/:id', updatePrivacy);
// Add this to your existing routes
router.post('/logout', authMiddleware, logoutUser);

router.post(
    '/upload-profile-picture',
    authMiddleware,
    upload.single('profilePicture'),
    uploadProfilePicture
);

router.post(
    '/skip-profile-picture',
    authMiddleware,
    skipProfilePicture
);

module.exports = router;