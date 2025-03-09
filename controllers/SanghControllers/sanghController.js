// server/controller/SanghControllers/sanghController.js
const Sangh = require('../../models/SanghModels/sanghModel');
const User = require('../../models/UserRegistrationModels/userModel');
const asyncHandler = require('express-async-handler');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { s3Client, DeleteObjectCommand } = require('../../config/s3Config');
const { extractS3KeyFromUrl } = require('../../utils/s3Utils');

// Add these validation functions at the top of the file
const validateOfficeBearerAvailability = async (userId, level) => {
  const existingSangh = await Sangh.findOne({
    $or: [
      { 'officeBearers.president.userId': userId },
      { 'officeBearers.secretary.userId': userId },
      { 'officeBearers.treasurer.userId': userId }
    ],
    level: level,
    status: 'active'
  });

  if (existingSangh) {
    let position = '';
    if (existingSangh.officeBearers.president.userId.toString() === userId.toString()) {
      position = 'President';
    } else if (existingSangh.officeBearers.secretary.userId.toString() === userId.toString()) {
      position = 'Secretary';
    } else if (existingSangh.officeBearers.treasurer.userId.toString() === userId.toString()) {
      position = 'Treasurer';
    }
    throw new Error(`User already holds ${position} position in ${existingSangh.name} at ${level} level`);
  }
};

const validateLocationHierarchy = (level, location) => {
  switch (level) {
    case 'city':
      if (!location.city || !location.district || !location.state) {
        throw new Error('City level Sangh requires city, district and state');
      }
      break;
    case 'district':
      if (!location.district || !location.state) {
        throw new Error('District level Sangh requires district and state');
      }
      break;
    case 'state':
      if (!location.state) {
        throw new Error('State level Sangh requires state');
      }
      break;
  }
};

// Update the validation function
const validateConstituentSanghs = async (constituentSanghIds, level) => {
  if (!['district', 'state', 'country'].includes(level)) {
    return true;
  }

  const expectedLevel = {
    district: 'city',
    state: 'district',
    country: 'state'
  };

  // Find Sanghs by sanghId
  const constituentSanghs = await Sangh.find({
    sanghId: { $in: constituentSanghIds }
  });

  if (constituentSanghs.length < 2) {
    throw new Error(`${level} level Sangh requires at least 2 ${expectedLevel[level]} level Sanghs`);
  }

  if (constituentSanghs.length !== constituentSanghIds.length) {
    throw new Error('One or more constituent Sangh IDs are invalid');
  }

  // Check if any constituent Sangh is already part of another Sangh
  for (const sangh of constituentSanghs) {
    const existingParent = await Sangh.findOne({
      constituentSanghs: sangh.sanghId,
      status: 'active'
    });

    if (existingParent) {
      throw new Error(`Sangh ${sangh.sanghId} is already part of ${existingParent.name} (${existingParent.sanghId})`);
    }
  }

  // Verify all constituent Sanghs are from the same region
  const locationField = {
    district: 'district',
    state: 'state',
    country: 'country'
  }[level];

  const locations = constituentSanghs.map(s => s.location[locationField]);
  if (new Set(locations).size !== 1) {
    throw new Error(`All constituent Sanghs must be from the same ${locationField}`);
  }

  // Verify level
  const validLevel = constituentSanghs.every(s => s.level === expectedLevel[level]);
  if (!validLevel) {
    throw new Error(`${level} level Sangh can only be formed from ${expectedLevel[level]} level Sanghs`);
  }

  return constituentSanghs;
};

// Core Sangh Management Functions
const createSangh = asyncHandler(async (req, res) => {
  try {
    const {
      name,
      level,
      location,
      presidentId,
      secretaryId,
      treasurerId,
      memberIds,
      constituentSanghIds,
    } = req.body;

    // Validate location hierarchy
    validateLocationHierarchy(level, location);

    // Validate office bearer availability
    await validateOfficeBearerAvailability(presidentId, level);
    await validateOfficeBearerAvailability(secretaryId, level);
    await validateOfficeBearerAvailability(treasurerId, level);

    // For higher level Sanghs, validate constituent Sanghs
    let constituentSanghs = [];
    if (['district', 'state', 'country'].includes(level)) {
      if (!constituentSanghIds || !Array.isArray(constituentSanghIds)) {
        return errorResponse(res, `${level} level Sangh requires constituent Sanghs`, 400);
      }

      // Use the validated constituent Sanghs
      constituentSanghs = await validateConstituentSanghs(constituentSanghIds, level);
    }

    // For city level, validate members
    if (level === 'city') {
      if (!memberIds || memberIds.length < 3) {
        return errorResponse(res, 'City Sangh must have at least 3 members', 400);
      }

      // Check if any member ID matches with office bearers
      const officeBearerIds = [presidentId, secretaryId, treasurerId];
      const hasDuplicateUsers = memberIds.some(memberId =>
        officeBearerIds.includes(memberId)
      );

      if (hasDuplicateUsers) {
        return errorResponse(res, 'Office bearers cannot be regular members', 400);
      }

      // Check if all member IDs are unique
      const uniqueMemberIds = new Set(memberIds);
      if (uniqueMemberIds.size !== memberIds.length) {
        return errorResponse(res, 'Duplicate members are not allowed', 400);
      }

      // Check if all office bearer IDs are unique
      const uniqueOfficeBearerIds = new Set(officeBearerIds);
      if (uniqueOfficeBearerIds.size !== 3) {
        return errorResponse(res, 'Office bearer positions must be held by different people', 400);
      }
    }

    // Handle uploaded files from S3
    const documents = {
      president: {
        document: req.files['presidentJainAadhar']?.[0]?.location,
        photo: req.files['presidentPhoto']?.[0]?.location
      },
      secretary: {
        document: req.files['secretaryJainAadhar']?.[0]?.location,
        photo: req.files['secretaryPhoto']?.[0]?.location
      },
      treasurer: {
        document: req.files['treasurerJainAadhar']?.[0]?.location,
        photo: req.files['treasurerPhoto']?.[0]?.location
      }
    };

    // Verify all required documents are uploaded
    if (!documents.president.document || !documents.president.photo ||
      !documents.secretary.document || !documents.secretary.photo ||
      !documents.treasurer.document || !documents.treasurer.photo) {
      return errorResponse(res, 'All required documents must be uploaded', 400);
    }

    // Verify all office bearers have valid Jain Aadhar
    const officeBearers = await User.find({
      _id: { $in: [presidentId, secretaryId, treasurerId] },
      jainAadharStatus: 'verified'
    });

    if (officeBearers.length !== 3) {
      await deleteS3Files(documents);
      return errorResponse(res, 'All office bearers must have verified Jain Aadhar', 400);
    }

    // Create Sangh data object
    const sanghData = {
      name,
      level,
      location,
      officeBearers: {
        president: {
          userId: presidentId,
          name: officeBearers.find(u => u._id.toString() === presidentId).fullName,
          jainAadharNumber: officeBearers.find(u => u._id.toString() === presidentId).jainAadharNumber,
          document: documents.president.document,
          photo: documents.president.photo
        },
        secretary: {
          userId: secretaryId,
          name: officeBearers.find(u => u._id.toString() === secretaryId).fullName,
          jainAadharNumber: officeBearers.find(u => u._id.toString() === secretaryId).jainAadharNumber,
          document: documents.secretary.document,
          photo: documents.secretary.photo
        },
        treasurer: {
          userId: treasurerId,
          name: officeBearers.find(u => u._id.toString() === treasurerId).fullName,
          jainAadharNumber: officeBearers.find(u => u._id.toString() === treasurerId).jainAadharNumber,
          document: documents.treasurer.document,
          photo: documents.treasurer.photo
        }
      },
      currentTerm: {
        startDate: new Date(),
        endDate: new Date(Date.now() + (2 * 365 * 24 * 60 * 60 * 1000)),
        termNumber: 1
      }
    };

    // Add members for city level
    if (level === 'city') {
      const members = await User.find({
        _id: { $in: memberIds },
        jainAadharStatus: 'verified'
      });

      sanghData.members = members.map(member => ({
        userId: member._id,
        name: member.fullName,
        jainAadharNumber: member.jainAadharNumber,
        email: member.email || '',
        phoneNumber: member.phoneNumber,
        address: member.city || '',
        documents: {
          jainAadhar: member.jainAadharDocument,
          profilePicture: member.profilePicture
        }
      }));
    }

    // Add constituent Sanghs for higher levels
    if (['district', 'state', 'country'].includes(level)) {
      sanghData.constituentSanghs = constituentSanghIds;
      sanghData.childSanghs = constituentSanghs.map(s => s._id);
    }

    const sangh = await Sangh.create(sanghData);

    // Update constituent Sanghs with new parent
    if (constituentSanghs.length > 0) {
      await Sangh.updateMany(
        { _id: { $in: constituentSanghs.map(s => s._id) } },
        { parentSangh: sangh._id }
      );
    }

    // Assign roles to users
    await Promise.all([
      User.findByIdAndUpdate(presidentId, {
        $push: {
          sanghRoles: {
            sanghId: sangh._id,
            role: 'president',
            level: level
          }
        }
      }),
      User.findByIdAndUpdate(secretaryId, {
        $push: {
          sanghRoles: {
            sanghId: sangh._id,
            role: 'secretary',
            level: level
          }
        }
      }),
      User.findByIdAndUpdate(treasurerId, {
        $push: {
          sanghRoles: {
            sanghId: sangh._id,
            role: 'treasurer',
            level: level
          }
        }
      }),
      ...(level === 'city' ? memberIds.map(memberId =>
        User.findByIdAndUpdate(memberId, {
          $push: {
            sanghRoles: {
              sanghId: sangh._id,
              role: 'member',
              level: level
            }
          }
        })
      ) : [])
    ]);

    return successResponse(res, sangh, 'Sangh created successfully', 201);
  } catch (error) {
    if (req.files) {
      await deleteS3Files(req.files);
    }
    return errorResponse(res, error.message, 500);
  }
});

// Helper function to delete files from S3
const deleteS3Files = async (files) => {
  const deletePromises = [];

  // Function to delete a single file
  const deleteFile = async (fileUrl) => {
    if (!fileUrl) return;
    try {
      const key = extractS3KeyFromUrl(fileUrl);
      if (key) {
        const deleteParams = {
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: key
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));
        console.log(`Successfully deleted file from S3: ${key}`);
      }
    } catch (error) {
      console.error(`Error deleting file from S3: ${fileUrl}`, error);
    }
  };

  // Handle all document types
  if (files.president) {
    deletePromises.push(deleteFile(files.president.document));
    deletePromises.push(deleteFile(files.president.photo));
  }
  if (files.secretary) {
    deletePromises.push(deleteFile(files.secretary.document));
    deletePromises.push(deleteFile(files.secretary.photo));
  }
  if (files.treasurer) {
    deletePromises.push(deleteFile(files.treasurer.document));
    deletePromises.push(deleteFile(files.treasurer.photo));
  }

  await Promise.all(deletePromises);
};

// Get all Sanghs with filters
const getAllSanghs = asyncHandler(async (req, res) => {
  try {
    const { level, city, district, state } = req.query;
    const query = {};

    if (level) query.level = level;
    if (city) query['location.city'] = city;
    if (district) query['location.district'] = district;
    if (state) query['location.state'] = state;

    const sanghs = await Sangh.find(query)
      .populate('officeBearers.president.userId', 'fullName')
      .populate('officeBearers.secretary.userId', 'fullName')
      .populate('officeBearers.treasurer.userId', 'fullName');

    return successResponse(res, sanghs, 'Sanghs retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Get Sangh by ID
const getSanghById = asyncHandler(async (req, res) => {
  try {
    const sangh = await Sangh.findById(req.params.id)
      .populate('officeBearers.president.userId')
      .populate('officeBearers.secretary.userId')
      .populate('officeBearers.treasurer.userId')
      .populate('members.userId');

    if (!sangh) {
      return errorResponse(res, 'Sangh not found', 404);
    }

    return successResponse(res, sangh, 'Sangh retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Consolidated Member Management Function with hierarchical permissions
const manageMember = asyncHandler(async (req, res) => {
    try {
        const { sanghId, memberId } = req.params;
        const action = req.method === 'POST' ? 'add' : 'remove';
        const userId = action === 'add' ? req.body.userId : memberId;

        // Note: isPresident middleware has already checked hierarchical permissions
        // We can proceed with the operation as the user has been verified

        const sangh = await Sangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        if (action === 'add') {
            // Add member logic
            const userToAdd = await User.findOne({
                _id: userId,
                jainAadharStatus: 'verified'
            });

            if (!userToAdd) {
                return errorResponse(res, 'User not found or not verified', 404);
            }

            // Check if user is already a member
            const isExistingMember = sangh.members.some(
                member => member.userId.toString() === userId
            );

            if (isExistingMember) {
                return errorResponse(res, 'User is already a member of this Sangh', 400);
            }

            sangh.members.push({
                userId: userToAdd._id,
                name: userToAdd.fullName,
                jainAadharNumber: userToAdd.jainAadharNumber,
                email: userToAdd.email || '',
                phoneNumber: userToAdd.phoneNumber,
                address: userToAdd.city || '',
                documents: {
                    jainAadhar: userToAdd.jainAadharDocument,
                    profilePicture: userToAdd.profilePicture
                }
            });

        } else {
            // Remove member logic
            if (sangh.members.length <= 3) {
                return errorResponse(res, 'Cannot remove member: Sangh must maintain at least 3 members', 400);
            }

            sangh.members = sangh.members.filter(
                member => member.userId.toString() !== userId
            );
        }

        // Update user's sanghRoles
        await User.findByIdAndUpdate(userId, {
            [action === 'add' ? '$push' : '$pull']: {
                sanghRoles: {
                    sanghId: sangh._id,
                    role: 'member',
                    level: sangh.level
                }
            }
        });

        await sangh.save();
        return successResponse(res, sangh, `Member ${action}ed successfully`);
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Edit member details with hierarchical permissions
const editMemberDetails = asyncHandler(async (req, res) => {
    try {
        const { sanghId, memberId } = req.params;
        const { personalDetails } = req.body;

        // Note: isPresident middleware has already checked hierarchical permissions
        // We can proceed with the operation as the user has been verified

        const sangh = await Sangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        const memberIndex = sangh.members.findIndex(
            member => member.userId.toString() === memberId
        );

        if (memberIndex === -1) {
            return errorResponse(res, 'Member not found in this Sangh', 404);
        }

        // Handle file uploads if provided
        const updates = { ...personalDetails };

        if (req.files) {
            // If new Jain Aadhar document is uploaded
            if (req.files['jainAadhar']) {
                // Delete old file from S3 if it exists
                if (sangh.members[memberIndex].documents.jainAadhar) {
                    const oldKey = extractS3KeyFromUrl(sangh.members[memberIndex].documents.jainAadhar);
                    if (oldKey) {
                        await s3Client.send(new DeleteObjectCommand({
                            Bucket: process.env.AWS_BUCKET_NAME,
                            Key: oldKey
                        }));
                    }
                }
                updates['documents.jainAadhar'] = req.files['jainAadhar'][0].location;
            }

            // If new profile picture is uploaded
            if (req.files['profilePicture']) {
                // Delete old file from S3 if it exists
                if (sangh.members[memberIndex].documents.profilePicture) {
                    const oldKey = extractS3KeyFromUrl(sangh.members[memberIndex].documents.profilePicture);
                    if (oldKey) {
                        await s3Client.send(new DeleteObjectCommand({
                            Bucket: process.env.AWS_BUCKET_NAME,
                            Key: oldKey
                        }));
                    }
                }
                updates['documents.profilePicture'] = req.files['profilePicture'][0].location;
            }
        }

        // Update member details
        Object.keys(updates).forEach(key => {
            if (key.startsWith('documents.')) {
                const docKey = key.split('.')[1];
                sangh.members[memberIndex].documents[docKey] = updates[key];
            } else {
                sangh.members[memberIndex][key] = updates[key];
            }
        });

        // Update name if provided
        if (personalDetails.name) {
            sangh.members[memberIndex].name = personalDetails.name;
        }
        if (personalDetails.email) {
            sangh.members[memberIndex].email = personalDetails.email;
        }
        if (personalDetails.phoneNumber) {
            sangh.members[memberIndex].phoneNumber = personalDetails.phoneNumber;
        }
        if (personalDetails.address) {
            sangh.members[memberIndex].address = personalDetails.address;
        }

        await sangh.save();

        return successResponse(res, sangh.members[memberIndex], 'Member details updated successfully');
    } catch (error) {
        // Clean up any uploaded files if there was an error
        if (req.files) {
            Object.values(req.files).forEach(async (fileArray) => {
                const file = fileArray[0];
                if (file?.location) {
                    const key = extractS3KeyFromUrl(file.location);
                    if (key) {
                        await s3Client.send(new DeleteObjectCommand({
                            Bucket: process.env.AWS_BUCKET_NAME,
                            Key: key
                        }));
                    }
                }
            });
        }
        return errorResponse(res, error.message, 500);
    }
});

// Hierarchy Management
const getHierarchy = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const sangh = await Sangh.findById(id);

    if (!sangh) {
      return errorResponse(res, 'Sangh not found', 404);
    }

    // Get complete hierarchy
    const hierarchy = {
      current: sangh,
      parent: null,
      children: [],
      siblings: []
    };

    // Get parent if exists
    if (sangh.parentSangh) {
      hierarchy.parent = await Sangh.findById(sangh.parentSangh)
        .select('name level location officeBearers');
    }

    // Get children if any
    hierarchy.children = await Sangh.find({ parentSangh: sangh._id })
      .select('name level location officeBearers');

    // Get siblings (other Sanghs at same level with same parent)
    if (sangh.parentSangh) {
      hierarchy.siblings = await Sangh.find({
        parentSangh: sangh.parentSangh,
        _id: { $ne: sangh._id }
      }).select('name level location officeBearers');
    }

    return successResponse(res, hierarchy, 'Hierarchy retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

const checkTenureStatus = asyncHandler(async (req, res) => {
  try {
    const { sanghId } = req.params;

    const sangh = await Sangh.findById(sanghId);
    if (!sangh) {
      return errorResponse(res, 'Sangh not found', 404);
    }

    const tenureStatus = sangh.checkTenureStatus();

    return successResponse(res, tenureStatus, 'Tenure status retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

const replaceOfficeBearer = asyncHandler(async (req, res) => {
  try {
    const { sanghId } = req.params;
    const { position, newBearerId, reason } = req.body;

    const sangh = await Sangh.findById(sanghId);
    if (!sangh) {
      return errorResponse(res, 'Sangh not found', 404);
    }

    // Verify if the position exists
    if (!['president', 'secretary', 'treasurer'].includes(position)) {
      return errorResponse(res, 'Invalid position specified', 400);
    }

    // Get current office bearer
    const currentBearer = sangh.officeBearers[position];

    // Verify tenure is actually ending or has ended
    const today = new Date();
    if (new Date(currentBearer.endDate) > today) {
      return errorResponse(res, 'Current office bearer\'s tenure has not ended yet', 400);
    }

    // Get new office bearer details
    const newBearer = await User.findById(newBearerId);
    if (!newBearer) {
      return errorResponse(res, 'New office bearer not found', 404);
    }

    // Verify new bearer is not holding any other position
    const hasOtherPosition = await Sangh.findOne({
      $or: [
        { 'officeBearers.president.userId': newBearerId },
        { 'officeBearers.secretary.userId': newBearerId },
        { 'officeBearers.treasurer.userId': newBearerId }
      ],
      level: sangh.level,
      status: 'active'
    });

    if (hasOtherPosition) {
      return errorResponse(res, 'New office bearer already holds a position in another Sangh', 400);
    }

    // Store current bearer in history
    currentBearer.history.push({
      role: position,
      startDate: currentBearer.startDate,
      endDate: currentBearer.endDate,
      reason
    });

    // Update with new bearer
    sangh.officeBearers[position] = {
      userId: newBearerId,
      name: newBearer.fullName,
      jainAadharNumber: newBearer.jainAadharNumber,
      startDate: new Date(),
      endDate: new Date(Date.now() + (2 * 365 * 24 * 60 * 60 * 1000)), // 2 years
      status: 'active'
    };

    // If documents are provided, update them
    if (req.files) {
      if (req.files[`${position}JainAadhar`]) {
        sangh.officeBearers[position].document = req.files[`${position}JainAadhar`][0].location;
      }
      if (req.files[`${position}Photo`]) {
        sangh.officeBearers[position].photo = req.files[`${position}Photo`][0].location;
      }
    }

    // Update term information if all office bearers are new
    const allNewTerm = Object.values(sangh.officeBearers).every(bearer =>
      new Date(bearer.startDate).getTime() > sangh.currentTerm.startDate.getTime()
    );

    if (allNewTerm) {
      // Store current term in previous terms
      sangh.previousTerms.push({
        termNumber: sangh.currentTerm.termNumber,
        startDate: sangh.currentTerm.startDate,
        endDate: new Date(),
        president: {
          userId: sangh.officeBearers.president.userId,
          name: sangh.officeBearers.president.name
        },
        secretary: {
          userId: sangh.officeBearers.secretary.userId,
          name: sangh.officeBearers.secretary.name
        },
        treasurer: {
          userId: sangh.officeBearers.treasurer.userId,
          name: sangh.officeBearers.treasurer.name
        }
      });

      // Start new term
      sangh.currentTerm = {
        startDate: new Date(),
        endDate: new Date(Date.now() + (2 * 365 * 24 * 60 * 60 * 1000)),
        termNumber: sangh.currentTerm.termNumber + 1
      };
    }

    await sangh.save();

    return successResponse(res, sangh, 'Office bearer replaced successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

const getTenureHistory = asyncHandler(async (req, res) => {
  try {
    const { sanghId } = req.params;

    const sangh = await Sangh.findById(sanghId)
      .select('previousTerms currentTerm officeBearers');

    if (!sangh) {
      return errorResponse(res, 'Sangh not found', 404);
    }

    const history = {
      currentTerm: {
        ...sangh.currentTerm.toObject(),
        officeBearers: {
          president: sangh.officeBearers.president,
          secretary: sangh.officeBearers.secretary,
          treasurer: sangh.officeBearers.treasurer
        }
      },
      previousTerms: sangh.previousTerms
    };

    return successResponse(res, history, 'Tenure history retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Update Sangh with document handling
const updateSangh = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // First find the Sangh
    const oldSangh = await Sangh.findById(id);
    if (!oldSangh) {
      if (req.files) {
        await deleteS3Files(req.files);
      }
      return errorResponse(res, 'Sangh not found', 404);
    }

    // Verify if the requesting user is the president
    const isPresident = oldSangh.officeBearers.president.userId.toString() === req.user._id.toString();
    if (!isPresident) {
      if (req.files) {
        await deleteS3Files(req.files);
      }
      return errorResponse(res, 'Only the President can update Sangh details', 403);
    }

    // Handle new document uploads
    if (req.files) {
      // Delete old files from S3
      await deleteS3Files({
        president: {
          document: oldSangh.officeBearers.president.document,
          photo: oldSangh.officeBearers.president.photo
        },
        secretary: {
          document: oldSangh.officeBearers.secretary.document,
          photo: oldSangh.officeBearers.secretary.photo
        },
        treasurer: {
          document: oldSangh.officeBearers.treasurer.document,
          photo: oldSangh.officeBearers.treasurer.photo
        }
      });

      // Update with new file locations
      if (req.files['presidentJainAadhar']) {
        updates['officeBearers.president.document'] = req.files['presidentJainAadhar'][0].location;
      }
      if (req.files['presidentPhoto']) {
        updates['officeBearers.president.photo'] = req.files['presidentPhoto'][0].location;
      }
      if (req.files['secretaryJainAadhar']) {
        updates['officeBearers.secretary.document'] = req.files['secretaryJainAadhar'][0].location;
      }
      if (req.files['secretaryPhoto']) {
        updates['officeBearers.secretary.photo'] = req.files['secretaryPhoto'][0].location;
      }
      if (req.files['treasurerJainAadhar']) {
        updates['officeBearers.treasurer.document'] = req.files['treasurerJainAadhar'][0].location;
      }
      if (req.files['treasurerPhoto']) {
        updates['officeBearers.treasurer.photo'] = req.files['treasurerPhoto'][0].location;
      }
    }

    const sangh = await Sangh.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return successResponse(res, sangh, 'Sangh updated successfully');
  } catch (error) {
    if (req.files) {
      await deleteS3Files(req.files);
    }
    return errorResponse(res, error.message, 500);
  }
});

module.exports = {
  createSangh,
  getAllSanghs,
  getSanghById,
  manageMember,
  updateSangh,
  getHierarchy,
  editMemberDetails,
  checkTenureStatus,
  replaceOfficeBearer,
  getTenureHistory
};