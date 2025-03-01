const JainAadhar = require('../../model/UserRegistrationModels/jainAadharModel');
const User = require('../../model/UserRegistrationModels/userModel');
const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const { jainAadharValidation } = require('../../validators/validations');
const { successResponse, errorResponse } = require('../../utils/apiResponse');

// Check if user has existing application
const checkExistingApplication = asyncHandler(async (req, res, next) => {
  const existingApplication = await JainAadhar.findOne({ userId: req.user._id, status: { $in: ['pending', 'approved'] } });
  if (existingApplication) {
    return errorResponse(res, 'You already have a pending or approved Jain Aadhar application', 400);
  }
  next();
});

// Create Jain Aadhar application
const createJainAadhar = [
  jainAadharValidation,
  checkExistingApplication,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    try {
      // Get file URLs from multer middleware
      const panCardUrl = req.files['panCard']?.[0]?.location;
      const aadharCardUrl = req.files['aadharCard']?.[0]?.location;
      const userProfileUrl = req.files['userProfile']?.[0]?.location;

      if (!panCardUrl || !aadharCardUrl || !userProfileUrl) {
        return errorResponse(res, 'All required documents must be uploaded', 400);
      }

      const jainAadharData = {
        ...req.body,
        userId: req.user._id,
        PanCard: panCardUrl,
        AadharCard: aadharCardUrl,
        userProfile: userProfileUrl,
        status: 'pending'
      };

      const newJainAadhar = await JainAadhar.create(jainAadharData);

      // Update user's Jain Aadhar status and application reference
      await User.findByIdAndUpdate(req.user._id, {
        jainAadharStatus: 'pending',
        jainAadharApplication: newJainAadhar._id
      });

      return successResponse(res, newJainAadhar, 'Jain Aadhar application submitted successfully', 201);
    } catch (error) {
      return errorResponse(res, 'Error creating Jain Aadhar application', 500, error.message);
    }
  })
];

// Get application status
const getApplicationStatus = asyncHandler(async (req, res) => {
  try {
    const application = await JainAadhar.findOne({ userId: req.user._id })
      .select('-PanCard -AadharCard');

    if (!application) {
      return errorResponse(res, 'No Jain Aadhar application found', 404);
    }

    return successResponse(res, {
      status: application.status,
      applicationId: application._id,
      submittedAt: application.createdAt
    }, 'Application status retrieved successfully');
  } catch (error) {
    return errorResponse(res, 'Error fetching application status', 500, error.message);
  }
});

// Admin: Get all applications
const getAllApplications = asyncHandler(async (req, res) => {
  try {
    const applications = await JainAadhar.find()
      .populate('userId', 'firstName lastName email')
      .sort('-createdAt');

    return successResponse(res, applications, 'Applications retrieved successfully', 200, applications.length);
  } catch (error) {
    return errorResponse(res, 'Error fetching applications', 500, error.message);
  }
});

// Function to generate unique Jain Aadhar number
const generateJainAadharNumber = async () => {
  while (true) {
    // Generate a random 8-digit number
    const randomNum = Math.floor(10000000 + Math.random() * 90000000);
    const jainAadharNumber = `JA${randomNum}`;
    
    // Check if this number already exists
    const existingUser = await User.findOne({ jainAadharNumber });
    if (!existingUser) {
      return jainAadharNumber;
    }
  }
};

// Admin: Review application
const reviewApplication = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const application = await JainAadhar.findById(id);
    if (!application) {
      return errorResponse(res, 'Application not found', 404);
    }

    if (application.status === 'approved' || application.status === 'rejected') {
      return errorResponse(res, `Application already ${application.status}`, 400);
    }

    let updateData = {
      status,
      remarks,
      reviewedAt: Date.now(),
      reviewedBy: req.user._id
    };

    // If approving, generate Jain Aadhar number
    if (status === 'approved') {
      const jainAadharNumber = await generateJainAadharNumber();
      updateData.jainAadharNumber = jainAadharNumber;
      updateData.approvedAt = Date.now();
      updateData.approvedBy = req.user._id;

      // Update user's status and Jain Aadhar number
      await User.findByIdAndUpdate(application.userId, {
        jainAadharStatus: 'verified',
        jainAadharNumber: jainAadharNumber
      });
    }

    // If rejecting, update user's status
    if (status === 'rejected') {
      await User.findByIdAndUpdate(application.userId, {
        jainAadharStatus: 'rejected'
      });
    }

    const updatedApplication = await JainAadhar.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('userId', 'firstName lastName email');

    return successResponse(res, updatedApplication, `Application ${status}. ${status === 'approved' ? `Jain Aadhar Number: ${updateData.jainAadharNumber}` : ''}`);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Admin: Get detailed application statistics
const getApplicationStats = asyncHandler(async (req, res) => {
  try {
    const stats = await JainAadhar.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          applications: { $push: '$$ROOT' }
        }
      }
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayStats = await JainAadhar.countDocuments({
      createdAt: { $gte: todayStart }
    });

    return successResponse(res, {
      overall: stats,
      today: todayStats
    }, 'Application statistics retrieved successfully');
  } catch (error) {
    return errorResponse(res, 'Error fetching statistics', 500, error.message);
  }
});

// Admin: Get application details with all documents
const getApplicationDetails = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const application = await JainAadhar.findById(id)
      .populate('userId', 'firstName lastName email mobile');

    if (!application) {
      return errorResponse(res, 'Application not found', 404);
    }

    return successResponse(res, application, 'Application details retrieved successfully');
  } catch (error) {
    return errorResponse(res, 'Error fetching application details', 500, error.message);
  }
});

// Admin: Add review comment
const addReviewComment = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    const application = await JainAadhar.findByIdAndUpdate(
      id,
      {
        $push: {
          reviewComments: {
            comment,
            reviewedBy: req.user._id,
            reviewedAt: Date.now()
          }
        }
      },
      { new: true }
    );

    return successResponse(res, application, 'Review comment added');
  } catch (error) {
    return errorResponse(res, 'Error adding review comment', 500, error.message);
  }
});

module.exports = {
  createJainAadhar,
  getApplicationStatus,
  getAllApplications,
  reviewApplication,
  getApplicationStats,
  getApplicationDetails,
  addReviewComment
};