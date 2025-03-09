const Story = require('../../models/SocialMediaModels/storyModel');
const User = require('../../models/UserRegistrationModels/userModel');
const asyncHandler = require('express-async-handler');
const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../../config/s3Config');
const { successResponse, errorResponse } = require('../../utils/apiResponse');

// Create Story
const createStory = asyncHandler(async (req, res) => {
    try {
        const { type } = req.body;
        const userId = req.user._id; // Get userId from authenticated user

        // Get S3 URLs from uploaded files
        const mediaFiles = req.files ? req.files.map(file => file.location) : [];
        
        // Validate story type
        if (!type) {
            return errorResponse(res, "Story type is required", 400);
        }

        // Validate media files
        if (mediaFiles.length === 0) {
            return errorResponse(res, "At least one media file is required", 400);
        }

        // Validate story type
        const validTypes = ['image', 'video', 'text'];
        if (!validTypes.includes(type)) {
            return errorResponse(res, `Invalid story type. Valid types are: ${validTypes.join(', ')}`, 400);
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

        return successResponse(res, newStory, "Story created successfully", 201);
    } catch (error) {
        console.error("Error creating story:", error);
        return errorResponse(res, "Error creating story", 500, error.message);
    }
});

// Get All Stories
const getAllStories = asyncHandler(async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
        const stories = await Story.find({ createdAt: { $gte: twentyFourHoursAgo } })
          .populate('userId', 'profilePicture firstName lastName')
          .skip(skip)
          .limit(parseInt(limit));
  
        const total = await Story.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } });
  
        return successResponse(res, {
            count: stories.length,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            data: stories,
        }, "Stories fetched successfully", 200);
    } catch (error) {
        console.error("Error fetching stories:", error);
        return errorResponse(res, "Error fetching stories", 500, error.message);
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
            return errorResponse(res, 'No active stories found for this user', 404);
        }

        return successResponse(res, stories, "Stories fetched successfully", 200);
    } catch (error) {
        console.error('Error fetching user stories:', error);
        return errorResponse(res, 'Error fetching user stories', 500, error.message);
    }
});

// Delete Story
const deleteStory = asyncHandler(async (req, res) => {
    try {
        const { storyId } = req.params;
        const userId = req.user._id; // Get userId from authenticated user

        // Find the story
        const story = await Story.findOne({
            _id: storyId,
            userId: userId 
        });

        if (!story) {
            return errorResponse(res, "Story not found or you don't have permission to delete it", 404);
        }

        // Remove story from user's stories array
        await User.findByIdAndUpdate(userId, {
            $pull: { story: storyId } 
        });

        // Delete the story document
        await Story.findByIdAndDelete(storyId);

        // Delete media from S3
        if (story.media && story.media.length > 0) {
            try {
                const deleteParams = {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Delete: {
                        Objects: story.media.map(mediaUrl => {
                            // Extract the key from the S3 URL
                            const key = mediaUrl.split('.com/')[1];
                            return { Key: key };
                        })
                    }
                };
                
                const deleteCommand = new DeleteObjectsCommand(deleteParams);
                await s3Client.send(deleteCommand);
                console.log('Successfully deleted media from S3');
            } catch (s3Error) {
                console.error('Error deleting media from S3:', s3Error);
                // Continue with the response even if S3 deletion fails
            }
        }

        return successResponse(res, {}, "Story and associated media deleted successfully", 200);
    } catch (error) {
        console.error("Error deleting story:", error);
        return errorResponse(res, "Error deleting story", 500, error.message);
    }
});

module.exports = {
    createStory,
    getAllStories,
    getStoriesByUser,
    deleteStory
};