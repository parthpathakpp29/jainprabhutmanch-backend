const SuggestionComplaint = require('../../models/SuggestionComplaintModels/SuggestionComplaint');
const User = require('../../models/UserRegistrationModels/userModel');
const HierarchicalSangh = require('../../models/SanghModels/hierarchicalSanghModel');
const { successResponse, errorResponse } = require('../../utils/apiResponse');

// Create Suggestion / Complaint
exports.createSuggestionComplaint = async (req, res) => {
  try {
    const { type, subject, description, recipient } = req.body;
    
    // Basic validation
    if (!type || !subject || !description || !recipient || !recipient.type) {
      return errorResponse(res, 'All required fields must be provided', 400);
    }
    
    // Validate recipient based on type
    if (recipient.type === 'sangh' && (!recipient.sanghLevel || !recipient.sanghId)) {
      return errorResponse(res, 'Sangh level and ID are required for sangh recipients', 400);
    }
    
    if (recipient.type === 'user' && !recipient.userId) {
      return errorResponse(res, 'User ID is required for user recipients', 400);
    }
    
    // Verify sangh exists if sending to a sangh
    if (recipient.type === 'sangh') {
      const sanghExists = await HierarchicalSangh.exists({ _id: recipient.sanghId });
      if (!sanghExists) {
        return errorResponse(res, 'Selected Sangh does not exist', 404);
      }
    }
    
    // Verify user exists if sending to a specific user
    if (recipient.type === 'user') {
      const userExists = await User.exists({ _id: recipient.userId });
      if (!userExists) {
        return errorResponse(res, 'Selected user does not exist', 404);
      }
    }
    
    // Create new suggestion/complaint
    const newSubmission = new SuggestionComplaint({
      type,
      subject,
      description,
      recipient,
      submittedBy: req.user._id
    });
    
    await newSubmission.save();
    
    return successResponse(
      res, 
      'Your ' + type + ' has been submitted successfully', 
      { reference: newSubmission._id },
      201
    );
  } catch (error) {
    console.error('Error creating suggestion/complaint:', error);
    return errorResponse(res, 'Internal Server Error', 500);
  }
};

// Get All Suggestions / Complaints (Admin or recipient view)
exports.getAllSuggestionsComplaints = async (req, res) => {
  try {
    const { type, status, startDate, endDate } = req.query;
    const userId = req.user._id;
    const isSuperAdmin = req.user.role === 'superadmin';
    
    // Build query based on user role and filters
    const query = {};
    
    // Filter by type if provided
    if (type) {
      query.type = type;
    }
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    }
    
    // Filter by date range if provided
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // For superadmin, show all or filter by recipient type 'superadmin'
    if (isSuperAdmin) {
      if (req.query.view === 'received') {
        query['recipient.type'] = 'superadmin';
      }
      // Otherwise, no additional filter - superadmin sees all
    } else {
      // For regular users, either show their submissions or ones directed to them
      if (req.query.view === 'received') {
        // Show submissions where user is the recipient
        query.$or = [
          { 'recipient.type': 'user', 'recipient.userId': userId },
          // Also include sangh-level submissions if user is a sangh official
          // This would need to be expanded based on your sangh permission system
        ];
      } else {
        // Default: show user's own submissions
        query.submittedBy = userId;
      }
    }
    
    // Execute query with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const submissions = await SuggestionComplaint.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('submittedBy', 'firstName lastName')
      .populate('recipient.sanghId', 'name level')
      .populate('recipient.userId', 'firstName lastName');
    
    const total = await SuggestionComplaint.countDocuments(query);
    
    return successResponse(res, 'Suggestions/complaints retrieved successfully', {
      submissions,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error retrieving suggestions/complaints:', error);
    return errorResponse(res, 'Internal Server Error', 500);
  }
};

// Get Single Suggestion / Complaint by ID
exports.getSuggestionComplaintById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const isSuperAdmin = req.user.role === 'superadmin';
    
    const submission = await SuggestionComplaint.findById(id)
      .populate('submittedBy', 'firstName lastName')
      .populate('recipient.sanghId', 'name level')
      .populate('recipient.userId', 'firstName lastName');
    
    if (!submission) {
      return errorResponse(res, 'Suggestion/complaint not found', 404);
    }
    
    // Check if user has permission to view this submission
    const isSubmitter = submission.submittedBy._id.toString() === userId.toString();
    const isRecipient = 
      (submission.recipient.type === 'user' && submission.recipient.userId?._id.toString() === userId.toString()) ||
      (submission.recipient.type === 'superadmin' && isSuperAdmin);
    // Add sangh permission check here based on your sangh permission system
    
    if (!isSubmitter && !isRecipient && !isSuperAdmin) {
      return errorResponse(res, 'You do not have permission to view this submission', 403);
    }
    
    return successResponse(res, 'Suggestion/complaint retrieved successfully', submission);
  } catch (error) {
    console.error('Error retrieving suggestion/complaint:', error);
    return errorResponse(res, 'Internal Server Error', 500);
  }
};

// Update Suggestion/Complaint Status and Response
exports.updateSuggestionComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, response } = req.body;
    const userId = req.user._id;
    const isSuperAdmin = req.user.role === 'superadmin';
    
    const submission = await SuggestionComplaint.findById(id);
    
    if (!submission) {
      return errorResponse(res, 'Suggestion/complaint not found', 404);
    }
    
    // Check if user has permission to update this submission
    const isRecipient = 
      (submission.recipient.type === 'user' && submission.recipient.userId.toString() === userId.toString()) ||
      (submission.recipient.type === 'superadmin' && isSuperAdmin);
    // Add sangh permission check here based on your sangh permission system
    
    if (!isRecipient && !isSuperAdmin) {
      return errorResponse(res, 'You do not have permission to update this submission', 403);
    }
    
    // Update fields
    if (status) {
      submission.status = status;
    }
    
    if (response) {
      submission.response = response;
    }
    
    await submission.save();
    
    return successResponse(res, 'Suggestion/complaint updated successfully', submission);
  } catch (error) {
    console.error('Error updating suggestion/complaint:', error);
    return errorResponse(res, 'Internal Server Error', 500);
  }
};

// Delete Suggestion / Complaint
exports.deleteSuggestionComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const isSuperAdmin = req.user.role === 'superadmin';
    
    const submission = await SuggestionComplaint.findById(id);
    
    if (!submission) {
      return errorResponse(res, 'Suggestion/complaint not found', 404);
    }
    
    // Only submitter or superadmin can delete
    const isSubmitter = submission.submittedBy.toString() === userId.toString();
    
    if (!isSubmitter && !isSuperAdmin) {
      return errorResponse(res, 'You do not have permission to delete this submission', 403);
    }
    
    await SuggestionComplaint.findByIdAndDelete(id);
    
    return successResponse(res, 'Suggestion/complaint deleted successfully');
  } catch (error) {
    console.error('Error deleting suggestion/complaint:', error);
    return errorResponse(res, 'Internal Server Error', 500);
  }
};
