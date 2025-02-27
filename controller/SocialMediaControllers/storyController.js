const Story = require('../../model/SocialMediaModels/storyModel');
const User = require('../../model/UserRegistrationModels/userModel');
const asyncHandler = require('express-async-handler');
const { S3Client, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../../config/s3Config');

// Create Story
const createStory = asyncHandler(async (req, res) => {
    try {
        const { type } = req.body;
        const userId = req.user._id; // Get userId from authenticated user

        // Get S3 URLs from uploaded files
        const mediaFiles = req.files ? req.files.map(file => file.location) : [];
        
        // Validate story type
        if (!type) {
            return res.status(400).json({
                success: false,
                message: "Story type is required"
            });
        }

        // Validate media files
        if (mediaFiles.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one media file is required"
            });
        }

        // Validate story type
        const validTypes = ['image', 'video', 'text'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: `Invalid story type. Valid types are: ${validTypes.join(', ')}`
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


const getAllStories = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
    const stories = await Story.find({ createdAt: { $gte: twentyFourHoursAgo } })
      .populate('userId', 'profilePicture firstName lastName')
      .skip(skip)
      .limit(parseInt(limit));
  
    const total = await Story.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } });
  
    res.status(200).json({
      success: true,
      count: stories.length,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: stories,
    });
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
        const { storyId } = req.params;
        const userId = req.user._id; // Get userId from authenticated user
        
        // Verify story ownership
        const story = await Story.findOne({
            _id: storyId,
            userId: userId // Ensure the authenticated user owns the story
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

        // Delete media from S3
        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Delete: {
                Objects: story.media.map(mediaUrl => ({ Key: mediaUrl.split('.com/')[1] }))
            }
        };
        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await s3Client.send(deleteCommand);

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