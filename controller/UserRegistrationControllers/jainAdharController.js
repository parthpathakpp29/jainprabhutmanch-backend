const JainAadhar = require('../../model/UserRegistrationModels/jainAadharModel');
const User = require('../../model/UserRegistrationModels/userModel');
const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const { jainAadharValidation } = require('../../validators/validations');

// Check if user has existing application
const checkExistingApplication = asyncHandler(async (req, res, next) => {
  const existingApplication = await JainAadhar.findOne({ userId: req.user._id, status: { $ne: 'rejected' } });
  if (existingApplication) {
    return res.status(400).json({
      success: false,
      message: 'You already have a pending Jain Aadhar application'
    });
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
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      // Get file URLs from multer middleware
      const panCardUrl = req.files['panCard']?.[0]?.location;
      const aadharCardUrl = req.files['aadharCard']?.[0]?.location;
      const userProfileUrl = req.files['userProfile']?.[0]?.location;

      if (!panCardUrl || !aadharCardUrl || !userProfileUrl) {
        return res.status(400).json({
          success: false,
          message: 'All required documents must be uploaded'
        });
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

      res.status(201).json({
        success: true,
        message: 'Jain Aadhar application submitted successfully',
        data: newJainAadhar
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating Jain Aadhar application',
        error: error.message
      });
    }
  })
];

// Get application status
const getApplicationStatus = asyncHandler(async (req, res) => {
  try {
    const application = await JainAadhar.findOne({ userId: req.user._id })
      .select('-PanCard -AadharCard');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'No Jain Aadhar application found'
      });
    }

    res.json({
      success: true,
      data: {
        status: application.status,
        applicationId: application._id,
        submittedAt: application.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching application status',
      error: error.message
    });
  }
});

// Admin: Get all applications
const getAllApplications = asyncHandler(async (req, res) => {
  try {
    const applications = await JainAadhar.find()
      .populate('userId', 'firstName lastName email')
      .sort('-createdAt');

    res.json({
      success: true,
      count: applications.length,
      data: applications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching applications',
      error: error.message
    });
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
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (application.status === 'approved' || application.status === 'rejected') {
      return res.status(400).json({
        success: false,
        message: `Application already ${application.status}`
      });
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

    res.json({
      success: true,
      message: `Application ${status}. ${status === 'approved' ? `Jain Aadhar Number: ${updateData.jainAadharNumber}` : ''}`,
      data: updatedApplication
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
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

    res.json({
      success: true,
      data: {
        overall: stats,
        today: todayStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

// Admin: Get application details with all documents
const getApplicationDetails = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const application = await JainAadhar.findById(id)
      .populate('userId', 'firstName lastName email mobile');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    res.json({
      success: true,
      data: application
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching application details',
      error: error.message
    });
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

    res.json({
      success: true,
      message: 'Review comment added',
      data: application
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding review comment',
      error: error.message
    });
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