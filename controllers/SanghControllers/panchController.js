const asyncHandler = require('express-async-handler');
const Panch = require('../../models/SanghModels/panchModel');
const Sangh = require('../../models/SanghModels/sanghModel');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { s3Client, DeleteObjectCommand } = require('../../config/s3Config');
const { extractS3KeyFromUrl } = require('../../utils/s3Utils');

// Get all Panch members of a Sangh
const getPanchMembers = asyncHandler(async (req, res) => {
    try {
        const { sanghId } = req.params;
        const { status } = req.query;

        const query = { sanghId };
        if (status) {
            query.status = status;
        }

        const panchMembers = await Panch.find(query)
            .sort({ createdAt: -1 });

        return successResponse(res, panchMembers, 'Panch members retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Update Panch member status with hierarchical permissions
const updatePanchStatus = asyncHandler(async (req, res) => {
    try {
        const { sanghId, panchId } = req.params;
        const { status, replacementMember, replacementDocs } = req.body;

        // Note: isPresident middleware has already checked hierarchical permissions
        // We can proceed with the operation as the user has been verified

        const panchGroup = await Panch.findOne({ sanghId });
        if (!panchGroup) {
            return errorResponse(res, 'Panch group not found', 404);
        }

        const memberToUpdate = panchGroup.members.id(panchId);
        if (!memberToUpdate) {
            return errorResponse(res, 'Panch member not found', 404);
        }

        // If deactivating a member, require a replacement
        if (status === 'inactive') {
            if (!replacementMember || !replacementDocs) {
                return errorResponse(res, 'Replacement member details and documents are required when deactivating a member', 400);
            }

            // Verify replacement member belongs to Sangh
            const sangh = await Sangh.findById(panchGroup.sanghId);
            const isSanghMember = sangh.members.some(m => 
                m.jainAadharNumber === replacementMember.jainAadharNumber
            );

            if (!isSanghMember) {
                return errorResponse(res, 'Replacement member must be a Sangh member', 400);
            }

            // Create new member entry
            const newMember = {
                personalDetails: replacementMember,
                documents: {
                    jainAadharPhoto: replacementDocs.jainAadharPhoto,
                    profilePhoto: replacementDocs.profilePhoto
                },
                status: 'active'
            };

            // Update the Panch document
            await Panch.findOneAndUpdate(
                { 'members._id': panchId },
                {
                    $set: {
                        'members.$.status': 'inactive',
                        'members.$.endDate': new Date()
                    },
                    $push: { members: newMember }
                }
            );

            return successResponse(res, null, 'Panch member replaced successfully');
        }

        // If just updating status
        memberToUpdate.status = status;
        await memberToUpdate.save();

        return successResponse(res, memberToUpdate, 'Panch member status updated successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Edit Panch member with hierarchical permissions
const editPanchMember = asyncHandler(async (req, res) => {
    try {
        const { sanghId, panchId } = req.params;
        const { personalDetails } = req.body;

        // Note: isPresident middleware has already checked hierarchical permissions
        // We can proceed with the operation as the user has been verified

        const updatedMember = await Panch.findOneAndUpdate(
            { 
                sanghId,
                'members._id': panchId 
            },
            {
                $set: {
                    'members.$.personalDetails': personalDetails
                }
            },
            { new: true }
        );

        if (!updatedMember) {
            return errorResponse(res, 'Panch member not found', 404);
        }

        return successResponse(res, updatedMember, 'Panch member details updated successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Delete Panch group with hierarchical permissions
const deletePanchGroup = asyncHandler(async (req, res) => {
    try {
        const { sanghId } = req.params;

        // Note: isPresident middleware has already checked hierarchical permissions
        // We can proceed with the operation as the user has been verified

        const panchGroup = await Panch.findOne({ sanghId });
        if (!panchGroup) {
            return errorResponse(res, 'Panch group not found', 404);
        }

        // Delete all S3 files
        for (const member of panchGroup.members) {
            if (member.documents.jainAadharPhoto) {
                const key = extractS3KeyFromUrl(member.documents.jainAadharPhoto);
                if (key) {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: key
                    }));
                }
            }
            if (member.documents.profilePhoto) {
                const key = extractS3KeyFromUrl(member.documents.profilePhoto);
                if (key) {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: key
                    }));
                }
            }
        }

        await Panch.deleteOne({ sanghId });
        return successResponse(res, null, 'Panch group deleted successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

// Create Panch group with all 5 members
const createPanchGroup = asyncHandler(async (req, res) => {
    try {
        const { sanghId } = req.params;
        const { members } = req.body;

        // Parse members array from form data
        let parsedMembers;
        try {
            parsedMembers = members.map(member =>
                typeof member === 'string' ? JSON.parse(member) : member
            );
        } catch (error) {
            return errorResponse(res, 'Invalid member data format', 400);
        }

        // 1. Validate exactly 5 members
        if (!Array.isArray(parsedMembers) || parsedMembers.length !== 5) {
            return errorResponse(res, 'Exactly 5 members are required', 400);
        }

        // 2. Verify Sangh exists and check hierarchical permissions
        const sangh = await Sangh.findById(sanghId);
        if (!sangh) {
            return errorResponse(res, 'Sangh not found', 404);
        }

        // Note: isPresident middleware has already checked hierarchical permissions
        // We can proceed with the operation as the user has been verified

        // 3. Check if Panch group already exists
        const existingPanch = await Panch.findOne({ sanghId, status: 'active' });
        if (existingPanch) {
            return errorResponse(res, 'Active Panch group already exists for this Sangh', 400);
        }

        // 4. Validate all members belong to Sangh and have unique Jain Aadhar numbers
        const jainAadharNumbers = new Set();
        for (const member of parsedMembers) {
            // Check if member belongs to Sangh
            const isSanghMember = sangh.members.some(m =>
                m.jainAadharNumber === member.personalDetails.jainAadharNumber
            );
            if (!isSanghMember) {
                return errorResponse(res,
                    `Member with Jain Aadhar ${member.personalDetails.jainAadharNumber} is not a Sangh member`,
                    400
                );
            }

            // Check for duplicate Jain Aadhar numbers
            if (jainAadharNumbers.has(member.personalDetails.jainAadharNumber)) {
                return errorResponse(res, 'Duplicate Jain Aadhar numbers found', 400);
            }
            jainAadharNumbers.add(member.personalDetails.jainAadharNumber);
        }

        // 5. Create member objects with documents

        // Then modify how you create member docs
        const membersWithDocs = parsedMembers.map((member, index) => {
            const jainAadharFile = req.files[`members[${index}].jainAadharPhoto`]?.[0];
            const profileFile = req.files[`members[${index}].profilePhoto`]?.[0];

            console.log(`Member ${index} files:`, {
                jainAadhar: jainAadharFile?.location,
                profile: profileFile?.location
            });

            return {
                personalDetails: member.personalDetails,
                documents: {
                    jainAadharPhoto: jainAadharFile?.location || '',
                    profilePhoto: profileFile?.location || ''
                },
                status: 'active'
            };
        });

        // 6. Create Panch group
        const panchGroup = await Panch.create({
            sanghId,
            members: membersWithDocs,
            term: {
                startDate: new Date(),
                endDate: new Date(Date.now() + (2 * 365 * 24 * 60 * 60 * 1000)) // 2 years
            }
        });

        return successResponse(res, panchGroup, 'Panch group created successfully', 201);

    } catch (error) {
        // Clean up uploaded files if there's an error
        if (req.files) {
            Object.values(req.files).forEach(fileArray => {
                fileArray.forEach(file => {
                    if (file.location) {
                        const key = file.key;
                        s3Client.send(new DeleteObjectCommand({
                            Bucket: process.env.AWS_BUCKET_NAME,
                            Key: key
                        }));
                    }
                });
            });
        }
        return errorResponse(res, error.message, 500);
    }
});

// Get Panch group details
const getPanchGroup = asyncHandler(async (req, res) => {
    try {
        const { sanghId } = req.params;

        const panchGroup = await Panch.findOne({
            sanghId,
            status: 'active'
        });

        if (!panchGroup) {
            return successResponse(res, null, 'No active Panch group found');
        }

        return successResponse(res, panchGroup, 'Panch group retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
});

module.exports = {
    getPanchMembers,
    updatePanchStatus,
    createPanchGroup,
    getPanchGroup,
    editPanchMember,
    deletePanchGroup
}; 