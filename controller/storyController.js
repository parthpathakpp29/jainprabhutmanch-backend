const Story = require('../model/storyModel');
const User = require('../model/userModel');
const asyncHandler = require('express-async-handler');

// Create Story
const createStory = asyncHandler(async (req, res) => {
    try {
        const { type } = req.body;
        const userId = req.user._id; // Get userId from authenticated user

        // Get S3 URLs from uploaded files
        const mediaFiles = req.files ? req.files.map(file => file.location) : [];
        
        if (!type) {
            return res.status(400).json({
                success: false,
                message: "Story type is required"
            });
        }

        if (mediaFiles.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one media file is required"
            });
        }

        const newStory = await Story.create({
            userId,
            media: mediaFiles,
            type
        });

        // Add story reference to user
        await User.findByIdAndUpdate(userId, {
            $push: { story: newStory._id }
        });

        res.status(201).json({
            success: true,
            message: "Story created successfully",
            data: newStory
        });
    } catch (error) {
        console.error("Error creating story:", error);
        res.status(500).json({
            success: false,
            message: "Error creating story",
            error: error.message
        });
    }
});

// Get All Stories
const getAllStories = asyncHandler(async (req, res) => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        // Fetch only stories from the last 24 hours
        const stories = await Story.find({
            createdAt: { $gte: twentyFourHoursAgo }
        }).populate("userId", "profilePicture firstName lastName");

        res.status(200).json({
            success: true,
            count: stories.length,
            data: stories
        });
    } catch (error) {
        console.error("Error fetching stories:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching stories",
            error: error.message
        });
    }
});

// Get Stories by User
const getStoriesByUser = asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const stories = await Story.find({
            userId,
            createdAt: { $gte: twentyFourHoursAgo }
        }).populate("userId", "profilePicture firstName lastName");

        if (!stories.length) {
            return res.status(404).json({
                success: false,
                message: 'No active stories found for this user'
            });
        }

        res.json({
            success: true,
            count: stories.length,
            data: stories
        });
    } catch (error) {
        console.error('Error fetching user stories:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user stories',
            error: error.message
        });
    }
});

// Delete Story
const deleteStory = asyncHandler(async (req, res) => {
    try {
        const { userId, storyId } = req.params;
        
        // Verify story ownership
        const story = await Story.findOne({
            _id: storyId,
            userId: req.user._id // Ensure the authenticated user owns the story
        });

        if (!story) {
            return res.status(404).json({
                success: false,
                message: "Story not found or unauthorized"
            });
        }

        // Delete the story
        await Story.findByIdAndDelete(storyId);

        // Remove story reference from User
        await User.findByIdAndUpdate(userId, {
            $pull: { story: storyId }
        });

        res.json({
            success: true,
            message: "Story deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting story:", error);
        res.status(500).json({
            success: false,
            message: "Error deleting story",
            error: error.message
        });
    }
});

module.exports = {
    createStory,
    getAllStories,
    getStoriesByUser,
    deleteStory
};
