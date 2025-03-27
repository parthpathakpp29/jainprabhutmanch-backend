const VyavahikBiodata = require('../models/VyavahikBiodata');
// Create API

/**
 * Create a temporary biodata (before payment)
 */
const createBiodataForm = async (req, res) => {
  try {
    // Store form data in the request for payment processing
    // This doesn't save to database yet, just validates and prepares the data
    
    // Normalize marriage type if provided
    if (req.body.remarrigeDetails?.marriageType) {
      req.body.remarrigeDetails.marriageType = req.body.remarrigeDetails.marriageType.trim().toLowerCase();
    }

    // Validate required fields
    if (!req.body.name || !req.body.gender) {
      return res.status(400).json({
        success: false,
        message: 'Name and gender are required fields.',
      });
    }

    // Divorce case me legal document required
    if (req.body.remarrigeDetails?.marriageType === 'divorce' && 
        !req.files['legalDocument']) {
      return res.status(400).json({
        success: false,
        message: 'Legal document is required for divorce cases.',
      });
    }
    
    // Add userId to the form data
    req.body.userId = req.user._id;
    
    // Return success with form data
    res.status(200).json({
      success: true,
      message: 'Biodata form validated successfully. Proceed to payment.',
      data: req.body
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error validating biodata form',
      error: error.message,
    });
  }
};

/**
 * Legacy direct creation method (to be deprecated)
 */
const createBiodata = async (req, res) => {
  try {
    // Extract image URLs from uploaded files
    const passportPhoto = req.files['passportPhoto'] ? req.files['passportPhoto'][0].location : null;
    const fullPhoto = req.files['fullPhoto'] ? req.files['fullPhoto'][0].location : null;
    const familyPhoto = req.files['familyPhoto'] ? req.files['familyPhoto'][0].location : null;
    const legalDocument = req.files['legalDocument'] ? req.files['legalDocument'][0].location : null;

    // Normalize marriage type
    const marriageType = req.body.remarrigeDetails?.marriageType?.trim().toLowerCase();

    // Divorce case me legal document required
    if (marriageType === 'divorce' && !legalDocument) {
      return res.status(400).json({
        success: false,
        message: 'Legal document is required for divorce cases.',
      });
    }

    // Create biodata with images & legal document
    const biodata = new VyavahikBiodata({
      ...req.body,
      userId: req.user._id,
      passportPhoto,
      fullPhoto,
      familyPhoto,
      remarrigeDetails: {
        ...req.body.remarrigeDetails,
        divorceDetails: {
          ...req.body.remarrigeDetails?.divorceDetails,
          legalDocument: legalDocument, // Add uploaded legal document
        },
      },
    });

    await biodata.save();

    res.status(201).json({
      success: true,
      message: 'Biodata created successfully!',
      data: biodata,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating biodata',
      error: error.message,
    });
  }
};


// Update API
const updateBiodata = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if the biodata belongs to the current user
    const biodata = await VyavahikBiodata.findById(id);
    
    if (!biodata) {
      return res.status(404).json({
        success: false,
        message: 'Biodata not found',
      });
    }
    
    // Only allow the owner or admin to update
    if (biodata.userId.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this biodata',
      });
    }
    
    const updatedBiodata = await VyavahikBiodata.findByIdAndUpdate(
      id,
      req.body,
      { new: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Biodata updated successfully!',
      data: updatedBiodata,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating biodata',
      error: error.message,
    });
  }
};

// Get Single Biodata API
const getBiodata = async (req, res) => {
  try {
    const { id } = req.params;
    const biodata = await VyavahikBiodata.findById(id);
    
    if (!biodata) {
      return res.status(404).json({
        success: false,
        message: 'Biodata not found',
      });
    }
    
    // If the biodata is not paid/visible and the requester is not the owner or admin
    if (!biodata.isVisible && 
        biodata.userId.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'This biodata is not available for viewing',
      });
    }
    
    res.status(200).json({
      success: true,
      data: biodata,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching biodata',
      error: error.message,
    });
  }
};

// Get All Biodatas API
const getAllBiodatas = async (req, res) => {
  try {
    // Check if the user has a paid biodata
    const userHasPaidBiodata = await VyavahikBiodata.exists({
      userId: req.user._id,
      paymentStatus: 'paid',
      isVisible: true
    });
    
    // If user doesn't have a paid biodata and is not admin
    if (!userHasPaidBiodata && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'You need to create and pay for your own biodata before viewing others',
      });
    }
    
    // Get query parameters for filtering
    const { gender, ageMin, ageMax, panth, upJati } = req.query;
    
    // Build filter object
    const filter = { 
      paymentStatus: 'paid',
      isVisible: true
    };
    
    // Add gender filter if provided
    if (gender) {
      filter.gender = gender;
    }
    
    // Add age range filter if provided
    if (ageMin || ageMax) {
      filter.age = {};
      if (ageMin) filter.age.$gte = parseInt(ageMin);
      if (ageMax) filter.age.$lte = parseInt(ageMax);
    }
    
    // Add panth filter if provided
    if (panth) {
      filter.panth = panth;
    }
    
    // Add upJati filter if provided
    if (upJati) {
      filter.upJati = upJati;
    }
    
    // Get biodatas with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const biodatas = await VyavahikBiodata.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await VyavahikBiodata.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      data: biodatas,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching biodatas',
      error: error.message,
    });
  }
};

// Check if user has a biodata
const checkUserBiodata = async (req, res) => {
  try {
    const biodata = await VyavahikBiodata.findOne({ userId: req.user._id });
    
    if (!biodata) {
      return res.status(200).json({
        success: true,
        hasBiodata: false
      });
    }
    
    res.status(200).json({
      success: true,
      hasBiodata: true,
      isPaid: biodata.paymentStatus === 'paid',
      isVisible: biodata.isVisible,
      biodataId: biodata._id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking biodata status',
      error: error.message,
    });
  }
};

module.exports = {
  createBiodata,
  createBiodataForm,
  updateBiodata,
  getBiodata,
  getAllBiodatas,
  checkUserBiodata
};
