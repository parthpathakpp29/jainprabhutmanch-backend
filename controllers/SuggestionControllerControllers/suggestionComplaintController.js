const SuggestionComplaint = require('../../models/SuggestionComplaintModels/SuggestionComplaint');
const User = require('../../models/UserRegistrationModels/userModel');
const HierarchicalSangh = require('../../models/SanghModels/hierarchicalSanghModel');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { createSuggestionNotification, createComplaintNotification, createNotification } = require('../../utils/notificationUtils');

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
      const sangh = await HierarchicalSangh.findById(recipient.sanghId)
        .populate({
          path: 'officeBearers',
          match: { role: 'president', status: 'active' },
          select: 'userId'
        });
      
      if (!sangh) {
        return errorResponse(res, 'Selected Sangh does not exist', 404);
      }
      
      // Check if the Sangh has an active president
      if (!sangh.officeBearers || sangh.officeBearers.length === 0) {
        return errorResponse(res, `The selected ${recipient.sanghLevel} Sangh does not have an active president to receive your ${type}`, 400);
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
    
    // Get sender's name for notification
    const sender = await User.findById(req.user._id, 'firstName lastName');
    const senderName = sender ? `${sender.firstName} ${sender.lastName}` : 'A user';
    
    // Send notification to recipient if it's a user
    if (recipient.type === 'user') {
      if (type === 'suggestion') {
        await createSuggestionNotification({
          senderId: req.user._id,
          receiverId: recipient.userId,
          entityId: newSubmission._id,
          subject,
          senderName
        });
      } else if (type === 'complaint') {
        await createComplaintNotification({
          senderId: req.user._id,
          receiverId: recipient.userId,
          entityId: newSubmission._id,
          subject,
          senderName
        });
      }
    }
    
    // For Sangh recipients, find the president and send notification
    if (recipient.type === 'sangh') {
      try {
        // Find the Sangh and its president
        const sangh = await HierarchicalSangh.findById(recipient.sanghId)
          .populate({
            path: 'officeBearers',
            match: { role: 'president', status: 'active' },
            select: 'userId'
          });
        
        if (sangh && sangh.officeBearers && sangh.officeBearers.length > 0) {
          const presidentUserId = sangh.officeBearers[0].userId;
          
          // Create notification for the president
          if (type === 'suggestion') {
            await createSuggestionNotification({
              senderId: req.user._id,
              receiverId: presidentUserId,
              entityId: newSubmission._id,
              subject,
              senderName,
              additionalInfo: `${recipient.sanghLevel} Sangh: ${sangh.name}`
            });
          } else if (type === 'complaint') {
            await createComplaintNotification({
              senderId: req.user._id,
              receiverId: presidentUserId,
              entityId: newSubmission._id,
              subject,
              senderName,
              additionalInfo: `${recipient.sanghLevel} Sangh: ${sangh.name}`
            });
          }
          
          console.log(`Notification sent to ${recipient.sanghLevel} Sangh president for ${type}`);
        }
      } catch (notificationError) {
        console.error('Error sending notification to Sangh president:', notificationError);
        // Continue execution - don't fail the submission if notification fails
      }
    }
    
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
    const { type, status, startDate, endDate, view } = req.query;
    const userId = req.user._id;
    const isSuperAdmin = req.user.role === 'superadmin';

    let query = {};

    // Optional filters
    if (type) query.type = type;
    if (status) query.status = status;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // 🔐 Access control by role and view
    if (view === 'received') {
      if (isSuperAdmin) {
        // ✅ Show all submissions — full access
        query = {}; // clear all filters to show everything
      } else {
        // ✅ If user is a Sangh president
        const sanghRoles = req.user.sanghRoles || [];
        const presidentSanghIds = sanghRoles
          .filter(r => r.role === 'president')
          .map(r => r.sanghId.toString());

        if (presidentSanghIds.length > 0) {
          query.$or = [
            { 'recipient.type': 'user', 'recipient.userId': userId },
            { 'recipient.type': 'sangh', 'recipient.sanghId': { $in: presidentSanghIds } }
          ];
        } else {
          // ✅ Regular user: only see suggestions sent to them
          query['recipient.type'] = 'user';
          query['recipient.userId'] = userId;
        }
      }
    } else if (view === 'sent') {
      // ✅ Show what this user submitted
      query.submittedBy = userId;
    } else {
      // Default behavior (like sent)
      query.submittedBy = userId;
    }

    // 🔁 Pagination
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
    
    const submission = await SuggestionComplaint.findById(id)
      .populate('submittedBy', 'firstName lastName');
    
    if (!submission) {
      return errorResponse(res, 'Suggestion/complaint not found', 404);
    }

    // Check if user is president of the sangh the suggestion was sent to
const isSanghPresidentRecipient =
submission.recipient.type === 'sangh' &&
req.user.sanghRoles?.some(role =>
  role.role === 'president' &&
  role.sanghId.toString() === submission.recipient.sanghId.toString() &&
  role.level === submission.recipient.sanghLevel
);

const isRecipient =
(submission.recipient.type === 'user' && submission.recipient.userId.toString() === userId.toString()) ||
(submission.recipient.type === 'superadmin' && isSuperAdmin) ||
isSanghPresidentRecipient;

    

    // Add sangh permission check here based on your sangh permission system
    
    if (!isRecipient && !isSuperAdmin) {
      return errorResponse(res, 'You do not have permission to update this submission', 403);
    }
    
    // Store old status for notification
    const oldStatus = submission.status;
    
    // Update fields
    if (status) {
      submission.status = status;
    }
    
    if (response) {
      submission.responses = submission.responses || [];
      submission.responses.push({
        text: response,
        respondedBy: userId,
        timestamp: new Date()
      });
    }
    
    await submission.save();
    
    // Send notification to submitter about status change
    if (status && status !== oldStatus) {
      // Get responder's name
      const responder = await User.findById(userId, 'firstName lastName');
      const responderName = responder ? `${responder.firstName} ${responder.lastName}` : 'A user';
      
      // Create notification for status update
      await createNotification({
        senderId: userId,
        receiverId: submission.submittedBy._id,
        type: submission.type === 'suggestion' ? 'suggestion' : 'complaint',
        message: `Your ${submission.type} "${submission.subject}" status has been updated to: ${status}`,
        entityId: submission._id,
        entityType: 'SuggestionComplaint'
      });
    }
    
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
