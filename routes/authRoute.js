const express = require('express');
const { 
    registerUser, 
    getAllUsers, 
    getUserById, 
    updateUserById, 
    loginUser, 
    updatePrivacy,
    uploadProfilePicture,
    skipProfilePicture
} = require('../controller/userController');
const { authMiddleware } = require('../middlewares/authMiddlewares');
const upload = require('../middlewares/upload');

const router = express.Router();

// Auth routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/users', getAllUsers);
router.get('/user/:id', getUserById);
router.put('/:id', updateUserById);
router.put('/update-privacy/:id', updatePrivacy);

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