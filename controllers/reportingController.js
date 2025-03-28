const Reporting = require('../models/ReportingModel');
const HierarchicalSangh = require('../models/SanghModels/hierarchicalSanghModel');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// Create a new report
exports.createReport = async (req, res) => {
  try {
    const {
      ikaiName,
      presidentName,
      secretaryName,
      treasurerName,
      reportMonth,
      reportYear,
      generalMeetingCount,
      boardMeetingCount,
      membership,
      jainAadharCount,
      projects,
      events,
      submittingSanghId
    } = req.body;

    // Basic validation
    if (!submittingSanghId) {
      return errorResponse(res, 'Submitting Sangh ID is required', 400);
    }

    // Find the submitting Sangh
    const submittingSangh = await HierarchicalSangh.findById(submittingSanghId);
    if (!submittingSangh) {
      return errorResponse(res, 'Submitting Sangh not found', 404);
    }

    // Determine parent Sangh based on hierarchy
    let recipientSanghId;
    
    if (submittingSangh.parentSanghId) {
      // If there's a parent Sangh, use it as recipient
      recipientSanghId = submittingSangh.parentSanghId;
    } else {
      // If no parent (e.g., National Sangh), report to itself
      recipientSanghId = submittingSanghId;
    }

    // Create the report
    const newReport = new Reporting({
      submittingSanghId,
      recipientSanghId,
      ikaiName,
      presidentName,
      secretaryName,
      treasurerName,
      reportMonth,
      reportYear,
      generalMeetingCount,
      boardMeetingCount,
      membership,
      jainAadharCount,
      projects,
      events,
      submittedById: req.user._id
    });

    await newReport.save();
    return successResponse(res, 'Report created successfully', newReport, 201);
  } catch (err) {
    console.error('Error creating report:', err);
    return errorResponse(res, 'Server error', 500);
  }
};

// Get a single report by ID
exports.getReportById = async (req, res) => {
  const { id } = req.params;

  try {
    const report = await Reporting.findById(id)
      .populate('submittingSanghId', 'name level')
      .populate('recipientSanghId', 'name level')
      .populate('submittedById', 'firstName lastName');
      
    if (!report) {
      return errorResponse(res, 'Report not found', 404);
    }
    
    return successResponse(res, 'Report retrieved successfully', report);
  } catch (err) {
    console.error('Error retrieving report:', err);
    return errorResponse(res, 'Server error', 500);
  }
};

// Get all reports (with filtering options)
exports.getAllReports = async (req, res) => {
  try {
    const { status, month, year } = req.query;
    const userId = req.user._id;
    const isSuperAdmin = req.user.role === 'superadmin';
    
    // Build query based on filters
    const query = {};
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    }
    
    // Filter by reporting period if provided
    if (month) {
      query.reportMonth = parseInt(month);
    }
    
    if (year) {
      query.reportYear = parseInt(year);
    }
    
    // For superadmin, show all reports
    // For others, only show reports they submitted or reports submitted to their Sangh
    if (!isSuperAdmin) {
      // Get user's Sangh IDs (user might be associated with multiple Sanghs)
      // This depends on your user-Sangh association structure
      // Simplified example:
      const userSanghIds = req.user.sanghRoles ? 
        req.user.sanghRoles.map(role => role.sanghId) : [];
      
      query.$or = [
        { submittedById: userId },
        { recipientSanghId: { $in: userSanghIds } }
      ];
    }
    
    // Execute query with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const reports = await Reporting.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('submittingSanghId', 'name level')
      .populate('recipientSanghId', 'name level')
      .populate('submittedById', 'firstName lastName');
    
    const total = await Reporting.countDocuments(query);
    
    return successResponse(res, 'Reports retrieved successfully', {
      reports,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error retrieving reports:', err);
    return errorResponse(res, 'Server error', 500);
  }
};

// Get reports submitted by my Sangh
exports.getSubmittedReports = async (req, res) => {
  try {
    const { sanghId } = req.params;
    const { status, month, year } = req.query;
    
    // Build query
    const query = { submittingSanghId: sanghId };
    
    // Add filters if provided
    if (status) query.status = status;
    if (month) query.reportMonth = parseInt(month);
    if (year) query.reportYear = parseInt(year);
    
    // Execute query with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const reports = await Reporting.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('recipientSanghId', 'name level');
    
    const total = await Reporting.countDocuments(query);
    
    return successResponse(res, 'Submitted reports retrieved successfully', {
      reports,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error retrieving submitted reports:', err);
    return errorResponse(res, 'Server error', 500);
  }
};

// Get reports received by my Sangh
exports.getReceivedReports = async (req, res) => {
  try {
    const { sanghId } = req.params;
    const { status, month, year } = req.query;
    
    // Build query
    const query = { recipientSanghId: sanghId };
    
    // Add filters if provided
    if (status) query.status = status;
    if (month) query.reportMonth = parseInt(month);
    if (year) query.reportYear = parseInt(year);
    
    // Execute query with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const reports = await Reporting.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('submittingSanghId', 'name level')
      .populate('submittedById', 'firstName lastName');
    
    const total = await Reporting.countDocuments(query);
    
    return successResponse(res, 'Received reports retrieved successfully', {
      reports,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error retrieving received reports:', err);
    return errorResponse(res, 'Server error', 500);
  }
};

// Update a report by ID
exports.updateReport = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  try {
    // Find the report
    const report = await Reporting.findById(id);
    
    if (!report) {
      return errorResponse(res, 'Report not found', 404);
    }
    
    // Check permissions - only allow updates by the submitter
    if (report.submittedById.toString() !== req.user._id.toString() && 
        req.user.role !== 'superadmin') {
      return errorResponse(res, 'Not authorized to update this report', 403);
    }
    
    // Don't allow changing submittingSanghId or recipientSanghId
    delete updates.submittingSanghId;
    delete updates.recipientSanghId;
    
    // Update the report
    const updatedReport = await Reporting.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    return successResponse(res, 'Report updated successfully', updatedReport);
  } catch (err) {
    console.error('Error updating report:', err);
    return errorResponse(res, 'Server error', 500);
  }
};

// Update report status and feedback
exports.updateReportStatus = async (req, res) => {
  const { id } = req.params;
  const { status, feedback } = req.body;
  
  try {
    // Find the report
    const report = await Reporting.findById(id)
      .populate('recipientSanghId', 'name level');
    
    if (!report) {
      return errorResponse(res, 'Report not found', 404);
    }
    
    // Check permissions - only allow status updates by the recipient
    // This depends on your user-Sangh association structure
    // Simplified example:
    const userSanghIds = req.user.sanghRoles ? 
      req.user.sanghRoles.map(role => role.sanghId.toString()) : [];
    
    if (!userSanghIds.includes(report.recipientSanghId._id.toString()) && 
        req.user.role !== 'superadmin') {
      return errorResponse(res, 'Not authorized to update this report status', 403);
    }
    
    // Update status and feedback
    report.status = status || report.status;
    if (feedback) {
      report.feedback = feedback;
    }
    
    await report.save();
    
    return successResponse(res, 'Report status updated successfully', report);
  } catch (err) {
    console.error('Error updating report status:', err);
    return errorResponse(res, 'Server error', 500);
  }
};

// Delete a report by ID
exports.deleteReport = async (req, res) => {
  const { id } = req.params;
  
  try {
    const report = await Reporting.findById(id);
    
    if (!report) {
      return errorResponse(res, 'Report not found', 404);
    }
    
    // Check permissions - only allow deletion by the submitter or superadmin
    if (report.submittedById.toString() !== req.user._id.toString() && 
        req.user.role !== 'superadmin') {
      return errorResponse(res, 'Not authorized to delete this report', 403);
    }
    
    await Reporting.findByIdAndDelete(id);
    
    return successResponse(res, 'Report deleted successfully');
  } catch (err) {
    console.error('Error deleting report:', err);
    return errorResponse(res, 'Server error', 500);
  }
};
