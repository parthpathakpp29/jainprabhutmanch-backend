const mongoose = require('mongoose');
const crypto = require('crypto');

const sadhuSchema = new mongoose.Schema({
    // Basic Info
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    guruName: {
        type: String,
        required: [true, 'Guru name is required'],
        trim: true
    },
    dikshaTithi: {
        type: Date,
        required: [true, 'Diksha tithi is required']
    },
    
    // Family Background
    purvMataPita: {
        fathersName: {
            type: String,
            required: [true, 'Father\'s name is required']
        },
        mothersName: {
            type: String,
            required: [true, 'Mother\'s name is required']
        },
        sanyaspurvjanmplace: String,
        sanyaspurvjanmaddress: String
    },

    // Religious Info
    mulJain: {
        type: String,
        required: [true, 'Mul Jain is required']
    },
    panth: {
        type: String,
        required: [true, 'Panth is required']
    },
    upjati: String,

    // Upadhi Details
    upadhiList: [{
        upadhiName: {
            type: String,
            required: true
        },
        upadhiDate: {
            type: Date,
            required: true
        },
        upadhiPlace: {
            type: String,
            required: true
        }
    }],
    
    sadhuName: {
        type: String,
        required: [true, 'Sadhu name is required']
    },
    selectedMulJain: {
        type: String
    },
    selectedPanth: {
        type: String,
        default: null
    },
    selectedUpjati: {
        type: String,
        default: null
    },
    gotra: {
        type: String
    },
    fatherName: {
        type: String
    },
    fatherPlace: {
        type: String
    },
    motherName: {
        type: String
    },
    motherPlace: {
        type: String
    },
    grandfatherName: {
        type: String
    },
    grandfatherPlace: {
        type: String
    },
    greatGrandfatherName: {
        type: String
    },
    greatGrandfatherPlace: {
        type: String
    },
    brotherName: {
        type: String,
        default: ''
    },
    sisterName: {
        type: String,
        default: ''
    },
    qualification: {
        type: String,
        default: ''
    },
    mamaPaksh: {
        nanajiName: {
            type: String
        },
        mulNiwasi: {
            type: String
        },
        mamaGotra: {
            type: String
        }
    },
    dharmParivartan: {
        jati: {
            type: String,
            default: ''
        },
        upjati: {
            type: String,
            default: ''
        },
        prerda: {
            type: String,
            default: ''
        },
        sanidhya: {
            type: String,
            default: ''
        },
        samay: {
            type: String,
            default: ''
        }
    },
    contactDetails: {
        permanentAddress: {
            type: String,
            default: ''
        },
        mobileNumber: {
            type: String
        },
        whatsappNumber: {
            type: String,
            default: ''
        },
        email: {
            type: String,
            default: ''
        }
    },
    uploadImage: {
        type: String,
        default: ''
    },

    // Application Status
    applicationStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    
    // Review Information
    reviewInfo: {
        reviewedBy: {
            cityPresidentId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            reviewDate: Date,
            comments: String
        }
    },

    // Submitted By
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // City Association
    citySanghId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HierarchicalSangh',
        required: true
    },

    // Media
    photo: String,
    documents: [String],

    // Active Status
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'inactive'
    }
}, {
    timestamps: true
});

// Add indexes for optimized queries
sadhuSchema.index({ name: 1 }); // For name-based searches
sadhuSchema.index({ 'contactDetails.permanentAddress.state': 1 }); // For state-based filtering
sadhuSchema.index({ 'contactDetails.permanentAddress.district': 1 }); // For district-based filtering
sadhuSchema.index({ 'contactDetails.permanentAddress.city': 1 }); // For city-based filtering
sadhuSchema.index({ createdAt: -1 }); // For sorting by creation date
sadhuSchema.index({ applicationStatus: 1 }); // For filtering verified sadhus
sadhuSchema.index({ panth: 1 }); // For filtering by sect
sadhuSchema.index({ name: 'text', sadhuName: 'text' }); // Text search for name and sadhu name

module.exports = mongoose.model('Sadhu', sadhuSchema);
