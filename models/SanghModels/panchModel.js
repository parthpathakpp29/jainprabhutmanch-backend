const mongoose = require('mongoose');
const crypto = require('crypto');

// Create a schema for individual Panch member details
const panchMemberSchema = new mongoose.Schema({
    personalDetails: {
        firstName: {
            type: String,
            required: [true, 'First name is required'],
            trim: true
        },
        surname: {
            type: String,
            required: [true, 'Surname is required'],
            trim: true
        },
        dateOfBirth: {
            type: Date,
            required: [true, 'Date of birth is required'],
            validate: {
                validator: function(dob) {
                    // Calculate age
                    const today = new Date();
                    const birthDate = new Date(dob);
                    let age = today.getFullYear() - birthDate.getFullYear();
                    const monthDiff = today.getMonth() - birthDate.getMonth();
                    
                    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                        age--;
                    }
                    
                    // Validate age is at least 50
                    return age >= 50;
                },
                message: 'Panch members must be at least 50 years old'
            }
        },
        mobileNumber: {
            type: String,
            required: [true, 'Mobile number is required'],
            validate: {
                validator: function(v) {
                    return /\d{10}/.test(v);
                },
                message: 'Please enter a valid 10-digit mobile number'
            }
        },
        educationQualification: {
            type: String,
            required: [true, 'Education qualification is required'],
            trim: true
        },
        jainAadharNumber: {
            type: String,
            required: [true, 'Jain Aadhar number is required']
        },
        professionalBio: {
            type: String,
            required: [true, 'Professional introduction is required'],
            maxLength: [500, 'Professional bio cannot exceed 500 characters']
        }
    },
    documents: {
        jainAadharPhoto: {
            type: String,  // S3 URL
            required: [true, 'Jain Aadhar photo is required']
        },
        profilePhoto: {
            type: String,  // S3 URL
            required: [true, 'Profile photo is required']
        }
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
});

const panchSchema = new mongoose.Schema({
    sanghId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HierarchicalSangh',
        required: [true, 'Sangh ID is required'],
        index: true
    },
    members: {
        type: [panchMemberSchema],
        validate: {
            validator: function(members) {
                return members.filter(m => m.status === 'active').length === 5;
            },
            message: 'Panch must have exactly 5 active members'
        }
    },
    accessId: {
        type: String,
        unique: true,
        sparse: true,
        default: function() {
            return 'PANCH-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        }
    },
    accessKey: {
        type: String,
        unique: true,
        sparse: true,
        default: function() {
            return crypto.randomBytes(8).toString('hex').toUpperCase();
        }
    },
    term: {
        startDate: {
            type: Date,
            default: Date.now
        },
        endDate: {
            type: Date,
            default: () => new Date(Date.now() + (2 * 365 * 24 * 60 * 60 * 1000)) // 2 years default
        }
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, {
    timestamps: true
});

// Add indexes (only those not defined in schema)
panchSchema.index({ status: 1 });
panchSchema.index({ 'members.personalDetails.jainAadharNumber': 1 });

module.exports = mongoose.model('Panch', panchSchema); 