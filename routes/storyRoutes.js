const express = require('express');
const { createStory, getAllStories, getStoriesByUser, deleteStory } = require('../controller/storyController');
const upload = require('../middlewares/upload');
const { authMiddleware } = require('../middlewares/authMiddlewares');
const router = express.Router();

// Protected routes
router.use(authMiddleware);

// Story routes
router.post("/", upload.storyUpload, createStory);
router.get('/get', getAllStories); 
router.get('/:userId', getStoriesByUser);
router.delete('/delete/:userId/:storyId', deleteStory);

module.exports = router;
