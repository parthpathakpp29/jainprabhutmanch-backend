const HierarchicalSangh = require('../../models/SanghModels/hierarchicalSanghModel');
const User = require('../../models/UserRegistrationModels/userModel');
const asyncHandler = require('express-async-handler');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { s3Client, DeleteObjectCommand } = require('../../config/s3Config');
const { extractS3KeyFromUrl } = require('../../utils/s3Utils');

// Helper Functions
const formatFullName = (firstName, lastName) => {
    return lastName.toLowerCase() === 'jain' 
        ? `${firstName} Jain`
        : `${firstName} Jain (${lastName})`;
};

const validateOfficeBearers = async (officeBearers) => {
    for (const role of ['president', 'secretary', 'treasurer']) {
        const user = await User.findOne({
            jainAadharNumber: officeBearers[role].jainAadharNumber,
            jainAadharStatus: 'verified'
        });

        if (!user) {
            throw new Error(`${role}'s Jain Aadhar is not verified`);
        }

        // Check if user is already an office bearer in another active Sangh
        const existingSangh = await HierarchicalSangh.findOne({
            'officeBearers': {
                $elemMatch: {
                    'userId': user._id,
                    'status': 'active'
                }
            },
            'status': 'active'
        });

        if (existingSangh) {
            throw new Error(`${role} is already an office bearer in another Sangh`);
        }
    }
};

// Controller Functions
// Create new Sangh
const createHierarchicalSangh = asyncHandler(async (req, res) => {
    try {
        const {
            name,
            level,
            location,
            officeBearers,
            parentSanghId,
            contact,
            establishedDate,
            description,
            socialMedia,
            parentSanghAccessId
        } = req.body;

        // Validate location hierarchy based on level
        if (level === 'area' && (!location.country || !location.state || !location.district || !location.city || !location.area)) {
            return errorResponse(res, 'Area level Sangh requires complete location hierarchy (country, state, district, city, area)', 400);
        }

        // Additional area-specific validation
        if (level === 'area') {
            const existingAreaSangh = await HierarchicalSangh.findOne({
                level: 'area',
                'location.country': location.country,
                'location.state': location.state,
                'location.district': location.district,
                'location.city': location.city,
                'location.area': location.area,
                status: 'active'
            });

            if (existingAreaSangh) {
                return errorResponse(res, 'An active Sangh already exists for this area', 400);
            }
        }

        // Validate required documents
        if (!req.files) {
            return errorResponse(res, 'Office bearer documents are required', 400);
        }

        const requiredDocs = [
            'presidentJainAadhar',
            'presidentPhoto',
            'secretaryJainAadhar',
            'secretaryPhoto',
            'treasurerJainAadhar',
            'treasurerPhoto'
        ];

        const missingDocs = requiredDocs.filter(doc => !req.files[doc]);
        if (missingDocs.length > 0) {
            return errorResponse(res, `Missing required documents: ${missingDocs.join(', ')}`, 400);
        }

        // Validate office bearers
        await validateOfficeBearers(officeBearers);

        // Validate hierarchy level before creation
        const parentSangh = parentSanghId ? await HierarchicalSangh.findById(parentSanghId) : null;
        if (parentSangh) {
            const levelHierarchy = ['country', 'state', 'district', 'city', 'area'];
            const parentIndex = levelHierarchy.indexOf(parentSangh.level);
            const currentIndex = levelHierarchy.indexOf(level);
            
            if (currentIndex <= parentIndex || currentIndex - parentIndex > 1) {
                return errorResponse(res, `Invalid hierarchy: ${level} level cannot be directly under ${parentSangh.level} level`, 400);
            }
        }

        // Format office bearers data
        const formattedOfficeBearers = await Promise.all(['president', 'secretary', 'treasurer'].map(async role => {
            const user = await User.findOne({ jainAadharNumber: officeBearers[role].jainAadharNumber });
            return {
                role,
                userId: user._id,
                firstName: officeBearers[role].firstName,
                lastName: officeBearers[role].lastName,
                name: formatFullName(officeBearers[role].firstName, officeBearers[role].lastName),
                jainAadharNumber: officeBearers[role].jainAadharNumber,
                document: req.files[`${role}JainAadhar`][0].location,
                photo: req.files[`${role}Photo`][0].location
            };
        }));

        // Create Sangh
        const sangh = await HierarchicalSangh.create({
            name,
            level,
            location,
            parentSangh: parentSanghId,
            officeBearers: formattedOfficeBearers,
            contact,
            establishedDate,
            description,
            socialMedia,
            createdBy: req.user._id
        });

        // Validate hierarchy
        await sangh.validateHierarchy();

        // Update office bearer roles in User model
        for (const bearer of formattedOfficeBearers) {
            await User.findByIdAndUpdate(bearer.userId, {
                $push: {
                    sanghRoles: {
                        sanghId: sangh._id,
                        role: bearer.role,
                        level: level
                    }
                }
            });
        }

        // Automatically create SanghAccess entry
        const SanghAccess = require('../../models/SanghModels/sanghAccessModel');
        const mongoose = require('mongoose');
        
        // Check if access already exists
        const existingAccess = await SanghAccess.findOne({ 
            sanghId: sangh._id,
            status: 'active'
        });
        
        let sanghAccess;
        let resolvedParentSanghAccessId = null;
        
        // Resolve parentSanghAccessId if provided
        if (parentSanghAccessId) {
            if (mongoose.Types.ObjectId.isValid(parentSanghAccessId)) {
                // It's already a valid ObjectId
                resolvedParentSanghAccessId = parentSanghAccessId;
            } else {
                // It might be an access code string
                const parentAccess = await SanghAccess.findOne({ 
                    accessId: parentSanghAccessId,
                    status: 'active'
                });
                
                if (parentAccess) {
                    resolvedParentSanghAccessId = parentAccess._id;
                }
            }
        }
        
        if (!existingAccess) {
            // Create new Sangh access
            sanghAccess = await SanghAccess.create({
                sanghId: sangh._id,
                level,
                location,
                createdBy: req.user._id,
                parentSanghAccess: resolvedParentSanghAccessId
            });
            
            // Update the Sangh with the sanghAccessId
            await HierarchicalSangh.findByIdAndUpdate(sangh._id, {
                sanghAccessId: sanghAccess._id
            });
            
            // Update the local sangh object for response
            sangh.sanghAccessId = sanghAccess._id;
            
            return successResponse(res, {
                sangh,
                accessId: sangh.accessId,
                sanghAccessId: sanghAccess._id,
                sanghAccessCode: sanghAccess.accessId
            }, 'Sangh created successfully with access', 201);
        } else {
            // If access already exists, ensure sanghAccessId is set
            if (!sangh.sanghAccessId) {
                await HierarchicalSangh.findByIdAndUpdate(sangh._id, {
                    sanghAccessId: existingAccess._id
                });
                sangh.sanghAccessId = existingAccess._id;
            }
            
            return successResponse(res, {
                sangh,
                accessId: sangh.accessId,
                sanghAccessId: existingAccess._id,
                sanghAccessCode: existingAccess.accessId
            }, 'Sangh created successfully with existing access', 201);
        }

    } catch (error) {
        if (req.files) {
            await deleteS3Files(req.files);
        }
        return errorResponse(res, error.message, 500);
    }
});

// Get Sangh hierarchy
const getHierarchy = asyncHandler(async (req, res) => {
    try {
        const sangh = await HierarchicalSangh.findById(req.params.id);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        const hierarchy = await sangh.getHierarchy();
        return successResponse(res, hierarchy, 'Hierarchy retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Get Sanghs by level and location
const getSanghsByLevelAndLocation = asyncHandler(async (req, res) => {
    try {
        const { level, country, state, district, city, page = 1, limit = 10 } = req.query;
        const query = { status: 'active' };

        if (level) query.level = level;
        if (country) query['location.country'] = country;
        if (state) query['location.state'] = state;
        if (district) query['location.district'] = district;
        if (city) query['location.city'] = city;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const sanghs = await HierarchicalSangh.find(query)
            .populate('parentSangh', 'name level location')
            .populate('officeBearers.userId', 'name email phoneNumber')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await HierarchicalSangh.countDocuments(query);

        return successResponse(res, {
            sanghs,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit))
            }
        }, 'Sanghs retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Get child Sanghs
const getChildSanghs = asyncHandler(async (req, res) => {
    try {
        const sangh = await HierarchicalSangh.findById(req.params.id);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        const children = await sangh.getChildSanghs();
        return successResponse(res, children, 'Child Sanghs retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Update Sangh
const updateHierarchicalSangh = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const sangh = await HierarchicalSangh.findById(id);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        // Validate user's permission
        const userRole = req.user.sanghRoles.find(role => 
            role.sanghId.toString() === id && 
            ['president', 'secretary'].includes(role.role)
        );

        if (!userRole && req.user.role !== 'superadmin') {
            return errorResponse(res, 'Not authorized to update this Sangh', 403);
        }

        // Handle document updates if files are provided
        if (req.files) {
            for (const role of ['president', 'secretary', 'treasurer']) {
                if (req.files[`${role}JainAadhar`]) {
                    const bearer = sangh.officeBearers.find(b => b.role === role);
                    if (bearer?.document) {
                        await deleteS3File(bearer.document);
                    }
                    updates[`officeBearers.$[elem].document`] = req.files[`${role}JainAadhar`][0].location;
                }
                if (req.files[`${role}Photo`]) {
                    const bearer = sangh.officeBearers.find(b => b.role === role);
                    if (bearer?.photo) {
                        await deleteS3File(bearer.photo);
                    }
                    updates[`officeBearers.$[elem].photo`] = req.files[`${role}Photo`][0].location;
                }
            }
        }

        const updatedSangh = await HierarchicalSangh.findByIdAndUpdate(
            id,
            { $set: updates },
            { 
                new: true, 
                runValidators: true,
                arrayFilters: [{ 'elem.status': 'active' }]
            }
        ).populate('officeBearers.userId', 'name email phoneNumber');

        return successResponse(res, updatedSangh, 'Sangh updated successfully');
    } catch (error) {
        if (req.files) {
            await deleteS3Files(req.files);
        }
        return errorResponse(res, error.message, 500);
    }
});

// Check office bearer terms
const checkOfficeBearerTerms = asyncHandler(async (req, res) => {
    try {
        const { sanghId } = req.params;

        const sangh = await HierarchicalSangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        const currentDate = new Date();
        const expiredBearers = sangh.officeBearers.filter(bearer => 
            bearer.status === 'active' && bearer.termEndDate < currentDate
        );

        if (expiredBearers.length > 0) {
            // Mark expired bearers as inactive
            await HierarchicalSangh.updateOne(
                { _id: sanghId },
                { 
                    $set: {
                        'officeBearers.$[elem].status': 'inactive'
                    }
                },
                {
                    arrayFilters: [{ 
                        'elem.status': 'active',
                        'elem.termEndDate': { $lt: currentDate }
                    }]
                }
            );

            return successResponse(res, {
                message: 'Office bearer terms checked',
                expiredBearers: expiredBearers.map(b => ({
                    role: b.role,
                    name: b.name,
                    termEndDate: b.termEndDate
                }))
            });
        }

        return successResponse(res, {
            message: 'No expired terms found'
        });
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Add member(s) to Sangh
const addSanghMember = asyncHandler(async (req, res) => {
    try {
        const sangh = req.sangh;
        const MAX_BULK_MEMBERS = 50;
        
        // Check if it's a bulk operation or single member addition
        const isBulkOperation = req.body.members && Array.isArray(req.body.members);
        
        if (isBulkOperation) {
            const { members } = req.body;
            
            if (members.length === 0) {
                return errorResponse(res, 'Members array cannot be empty', 400);
            }

            if (members.length > MAX_BULK_MEMBERS) {
                return errorResponse(res, `Cannot add more than ${MAX_BULK_MEMBERS} members at once`, 400);
            }
            
            const results = {
                success: [],
                failed: []
            };

            // Validate all members first
            for (const member of members) {
                if (!member.firstName || !member.lastName || !member.jainAadharNumber) {
                    results.failed.push({
                        jainAadharNumber: member.jainAadharNumber || 'unknown',
                        reason: 'Missing required fields'
                    });
                    continue;
                }

                try {
                    const user = await User.findOne({ 
                        jainAadharNumber: member.jainAadharNumber, 
                        jainAadharStatus: 'verified' 
                    });

                    if (!user) {
                        results.failed.push({
                            jainAadharNumber: member.jainAadharNumber,
                            reason: 'Invalid or unverified Jain Aadhar number'
                        });
                        continue;
                    }

                    if (sangh.members.some(m => m.jainAadharNumber === member.jainAadharNumber)) {
                        results.failed.push({
                            jainAadharNumber: member.jainAadharNumber,
                            reason: 'Already a member of this Sangh'
                        });
                        continue;
                    }

                    const newMember = {
                        userId: user._id,
                        firstName: member.firstName,
                        lastName: member.lastName,
                        name: formatFullName(member.firstName, member.lastName),
                        jainAadharNumber: member.jainAadharNumber,
                        email: member.email || user.email,
                        phoneNumber: member.phoneNumber || user.phoneNumber,
                        address: {
                            ...member.address,
                            city: member.address?.city || user.city,
                            district: member.address?.district || user.district,
                            state: member.address?.state || user.state
                        },
                        addedBy: req.user._id,
                        addedAt: new Date(),
                        status: 'active'
                    };

                    sangh.members.push(newMember);
                    results.success.push({
                        jainAadharNumber: member.jainAadharNumber,
                        name: newMember.name
                    });

                    // Update user's Sangh roles
                    await User.findByIdAndUpdate(user._id, {
                        $push: {
                            sanghRoles: {
                                sanghId: sangh._id,
                                role: 'member',
                                level: sangh.level,
                                addedAt: new Date()
                            }
                        }
                    });
                } catch (error) {
                    results.failed.push({
                        jainAadharNumber: member.jainAadharNumber,
                        reason: error.message
                    });
                }
            }

            if (results.success.length > 0) {
                await sangh.save();
            }

            return successResponse(res, {
                sangh: {
                    _id: sangh._id,
                    name: sangh.name,
                    level: sangh.level,
                    totalMembers: sangh.members.length
                },
                results
            }, `Added ${results.success.length} members successfully, ${results.failed.length} failed`);
        } 
        else {
            const { firstName, lastName, jainAadharNumber, email, phoneNumber, address } = req.body;

            if (!firstName || !lastName || !jainAadharNumber) {
                return errorResponse(res, 'Missing required fields', 400);
            }

            const user = await User.findOne({ 
                jainAadharNumber, 
                jainAadharStatus: 'verified' 
            });

            if (!user) {
                return errorResponse(res, 'Invalid or unverified Jain Aadhar number', 400);
            }

            if (sangh.members.some(m => m.jainAadharNumber === jainAadharNumber)) {
                return errorResponse(res, 'Already a member of this Sangh', 400);
            }

            const newMember = {
                userId: user._id,
                firstName,
                lastName,
                name: formatFullName(firstName, lastName),
                jainAadharNumber,
                email: email || user.email,
                phoneNumber: phoneNumber || user.phoneNumber,
                address: {
                    ...address,
                    city: address?.city || user.city,
                    district: address?.district || user.district,
                    state: address?.state || user.state
                },
                addedBy: req.user._id,
                addedAt: new Date(),
                status: 'active'
            };

            sangh.members.push(newMember);
            
            // Update user's Sangh roles
            await User.findByIdAndUpdate(user._id, {
                $push: {
                    sanghRoles: {
                        sanghId: sangh._id,
                        role: 'member',
                        level: sangh.level,
                        addedAt: new Date()
                    }
                }
            });

            await sangh.save();

            return successResponse(res, {
                member: newMember,
                sangh: {
                    _id: sangh._id,
                    name: sangh.name,
                    level: sangh.level,
                    totalMembers: sangh.members.length
                }
            }, 'Member added successfully');
        }
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Remove member from Sangh
const removeSanghMember = asyncHandler(async (req, res) => {
    try {
        const { sanghId, memberId } = req.params;

        const sangh = await HierarchicalSangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        // For city Sanghs, maintain minimum 3 members
        if (sangh.level === 'city' && sangh.members.length <= 3) {
            return errorResponse(res, 'City Sangh must maintain at least 3 members', 400);
        }

        const memberToRemove = sangh.members.find(
            member => member._id.toString() === memberId
        );

        if (!memberToRemove) {
            return errorResponse(res, 'Member not found', 404);
        }

        // Remove member's role from User document
        await User.findByIdAndUpdate(memberToRemove.userId, {
            $pull: {
                sanghRoles: {
                    sanghId: sangh._id
                }
            }
        });

        sangh.members = sangh.members.filter(
            member => member._id.toString() !== memberId
        );

        await sangh.save();
        return successResponse(res, sangh, 'Member removed successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Update member details
const updateMemberDetails = asyncHandler(async (req, res) => {
    try {
        const { sanghId, memberId } = req.params;
        const updates = req.body;

        const sangh = await HierarchicalSangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        const memberIndex = sangh.members.findIndex(
            member => member._id.toString() === memberId
        );

        if (memberIndex === -1) {
            return errorResponse(res, 'Member not found', 404);
        }

        // Handle document updates if files are provided
        if (req.files) {
            if (req.files['memberJainAadhar']) {
                // Delete old document if exists
                if (sangh.members[memberIndex].document) {
                    await deleteS3File(sangh.members[memberIndex].document);
                }
                updates.document = req.files['memberJainAadhar'][0].location;
            }
            if (req.files['memberPhoto']) {
                // Delete old photo if exists
                if (sangh.members[memberIndex].photo) {
                    await deleteS3File(sangh.members[memberIndex].photo);
                }
                updates.photo = req.files['memberPhoto'][0].location;
            }
        }

        // Update member details
        Object.assign(sangh.members[memberIndex], {
            ...sangh.members[memberIndex].toObject(),
            ...updates,
            name: updates.firstName && updates.lastName ? 
                formatFullName(updates.firstName, updates.lastName) : 
                sangh.members[memberIndex].name
        });

        await sangh.save();
        return successResponse(res, sangh, 'Member details updated successfully');
    } catch (error) {
        if (req.files) {
            await deleteS3Files(req.files);
        }
        return errorResponse(res, error.message, 500);
    }
});

// Get Sangh members
const getSanghMembers = asyncHandler(async (req, res) => {
    try {
        const { sanghId } = req.params;
        const { page = 1, limit = 10, search } = req.query;

        const sangh = await HierarchicalSangh.findById(sanghId)
            .populate({
                path: 'members.userId',
                select: 'email phoneNumber'
            });

        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        let members = sangh.members || [];

        // Apply search filter if provided
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            members = members.filter(member => 
                searchRegex.test(member.name) || 
                searchRegex.test(member.jainAadharNumber)
            );
        }

        // Apply pagination
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = parseInt(page) * parseInt(limit);
        const total = members.length;

        const paginatedMembers = members.slice(startIndex, endIndex);

        return successResponse(res, {
            members: paginatedMembers,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit))
            }
        }, 'Members retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Add multiple members to Sangh at once (for backward compatibility)
const addMultipleSanghMembers = asyncHandler(async (req, res) => {
    // Just call the enhanced addSanghMember function
    return addSanghMember(req, res);
});

// Helper function to delete S3 file
const deleteS3File = async (fileUrl) => {
    try {
        const key = extractS3KeyFromUrl(fileUrl);
        if (key) {
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: key
            };
            await s3Client.send(new DeleteObjectCommand(deleteParams));
        }
    } catch (error) {
        console.error(`Error deleting file from S3: ${fileUrl}`, error);
    }
};

// Helper function to delete multiple S3 files
const deleteS3Files = async (files) => {
    const deletePromises = [];
    for (const [role, roleFiles] of Object.entries(files)) {
        if (Array.isArray(roleFiles)) {
            roleFiles.forEach(file => {
                if (file.location) {
                    deletePromises.push(deleteS3File(file.location));
                }
            });
        }
    }
    await Promise.all(deletePromises);
};

module.exports = {
    createHierarchicalSangh,
    getHierarchy,
    getSanghsByLevelAndLocation,
    getChildSanghs,
    updateHierarchicalSangh,
    addSanghMember,
    removeSanghMember,
    updateMemberDetails,
    getSanghMembers,
    addMultipleSanghMembers,
    checkOfficeBearerTerms
}; 