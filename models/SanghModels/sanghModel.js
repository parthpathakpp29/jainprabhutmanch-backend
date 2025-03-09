// server/model/SanghModels/sanghModel.js
const mongoose = require('mongoose');

const officeBearerSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  name: String,
  jainAadharNumber: String,
  photo: String,
  document: String,
  startDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  endDate: {
    type: Date,
    default: function() {
      // Set 2-year tenure from start date
      const date = new Date(this.startDate);
      date.setFullYear(date.getFullYear() + 2);
      return date;
    },
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'terminated'],
    default: 'active'
  },
  history: [{
    role: String,
    startDate: Date,
    endDate: Date,
    reason: String
  }]
});

// Add validation for tenure period
officeBearerSchema.pre('save', function(next) {
  if (this.isModified('startDate') || this.isModified('endDate')) {
    // Calculate tenure duration in years
    const tenureYears = (this.endDate - this.startDate) / (365 * 24 * 60 * 60 * 1000);
    
    // Ensure tenure is exactly 2 years
    if (Math.abs(tenureYears - 2) > 0.1) { // Allow small deviation for day calculations
      next(new Error('Office bearer tenure must be exactly 2 years'));
    }
  }
  next();
});

const sanghSchema = new mongoose.Schema({
  sanghId: {
    type: String,
    unique: true,
  },
  name: {
    type: String,
    required: [true, 'Sangh name is required'],
    trim: true
  },
  level: {
    type: String,
    enum: ['city', 'district', 'state', 'country'],
    required: true
  },
  location: {
    city: String,
    district: String,
    state: String,
    country: String
  },
  officeBearers: {
    president: officeBearerSchema,
    secretary: officeBearerSchema,
    treasurer: officeBearerSchema
  },
  currentTerm: {
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: function() {
        const date = new Date(this.currentTerm.startDate);
        date.setFullYear(date.getFullYear() + 2);
        return date;
      }
    },
    termNumber: {
      type: Number,
      default: 1
    }
  },
  previousTerms: [{
    termNumber: Number,
    startDate: Date,
    endDate: Date,
    president: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String
    },
    secretary: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String
    },
    treasurer: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String
    }
  }],
  members: {
    type: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
      jainAadharNumber: String,
      email: String,
      phoneNumber: String,
      address: String,
      documents: {
        jainAadhar: String,
        profilePicture: String
      },
      joinedAt: { type: Date, default: Date.now }
    }],
    validate: {
      validator: function(members) {
        // Only validate minimum members for city level
        if (this.level === 'city') {
          return members.length >= 3;
        }
        return true;
      },
      message: 'City Sangh must have at least 3 members'
    }
  },
  // Track child Sanghs (lower level Sanghs that are part of this Sangh)
  childSanghs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sangh'
  }],
  // Track parent Sangh (higher level Sangh that this Sangh is part of)
  parentSangh: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sangh'
  },
  // For district/state/country level, track which Sanghs formed this Sangh
  constituentSanghs: [{
    type: String,
    required: function() {
      return ['district', 'state', 'country'].includes(this.level);
    },
    validate: {
      validator: async function(value) {
        if (!['district', 'state', 'country'].includes(this.level)) {
          return true;
        }
        const sangh = await mongoose.model('Sangh').findOne({ sanghId: value });
        return sangh !== null;
      },
      message: props => `${props.value} is not a valid Sangh ID`
    }
  }],
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Modify the pre-save middleware
sanghSchema.pre('save', async function(next) {
    if (this.isNew && !this.sanghId) {
        try {
            const prefix = {
                city: 'CITY',
                district: 'DIST',
                state: 'STATE',
                country: 'CTRY'
            }[this.level];

            const locationCode = this.location.city?.substring(0, 3).toUpperCase() || 
                               this.location.district?.substring(0, 3).toUpperCase() ||
                               this.location.state?.substring(0, 3).toUpperCase();
            
            const year = new Date().getFullYear().toString().slice(-2);
            
            // Get count of existing Sanghs at this level and location
            const count = await this.constructor.countDocuments({
                level: this.level,
                'location.city': this.location.city
            });
            
            const sequence = String(count + 1).padStart(3, '0');
            
            this.sanghId = `${prefix}-${locationCode}-${year}-${sequence}`;
        } catch (error) {
            next(error);
        }
    }
    next();
});

// Update the validation for constituent Sanghs to use sanghId
sanghSchema.pre('save', async function(next) {
  if (this.isModified('constituentSanghs')) {
    const minRequired = {
      district: 2,
      state: 2,
      country: 2
    };

    if (['district', 'state', 'country'].includes(this.level)) {
      if (!this.constituentSanghs || this.constituentSanghs.length < minRequired[this.level]) {
        throw new Error(`${this.level} level Sangh requires at least ${minRequired[this.level]} constituent Sanghs`);
      }

      // Verify constituent Sanghs are of correct level and exist
      const expectedLevel = {
        district: 'city',
        state: 'district',
        country: 'state'
      };

      const constituentSanghs = await mongoose.model('Sangh').find({
        sanghId: { $in: this.constituentSanghs }
      });

      if (constituentSanghs.length !== this.constituentSanghs.length) {
        throw new Error('One or more constituent Sangh IDs are invalid');
      }

      // Check if any of the constituent Sanghs are already part of another Sangh
      for (const sangh of constituentSanghs) {
        const existingParent = await mongoose.model('Sangh').findOne({
          _id: { $ne: this._id }, // Exclude current Sangh being saved
          constituentSanghs: sangh.sanghId,
          status: 'active'
        });

        if (existingParent) {
          throw new Error(`Sangh ${sangh.sanghId} is already part of ${existingParent.name} (${existingParent.sanghId})`);
        }
      }

      const validLevel = constituentSanghs.every(s => s.level === expectedLevel[this.level]);
      if (!validLevel) {
        throw new Error(`${this.level} level Sangh can only be formed from ${expectedLevel[this.level]} level Sanghs`);
      }

      // Verify all constituent Sanghs are from the same region
      const locations = constituentSanghs.map(s => {
        switch (this.level) {
          case 'district':
            return s.location.district;
          case 'state':
            return s.location.state;
          case 'country':
            return s.location.country;
        }
      });

      if (new Set(locations).size !== 1) {
        throw new Error(`All constituent Sanghs must be from the same ${this.level}`);
      }
    }
  }
  next();
});

// Add validation for removing members
sanghSchema.pre('save', function(next) {
  if (this.isModified('members') && this.members.length < 3) {
    next(new Error('Cannot reduce members below 3'));
  }
  next();
});

// Add method to check if user can be removed
sanghSchema.methods.canRemoveMember = function() {
  return this.members.length > 3;
};

// Add method to check if tenure is ending soon
sanghSchema.methods.checkTenureStatus = function() {
  const today = new Date();
  const warningPeriod = 30; // Days before tenure ends to start warning
  
  const presidentEndDate = new Date(this.officeBearers.president.endDate);
  const secretaryEndDate = new Date(this.officeBearers.secretary.endDate);
  const treasurerEndDate = new Date(this.officeBearers.treasurer.endDate);
  
  const endingPositions = [];
  
  if ((presidentEndDate - today) / (24 * 60 * 60 * 1000) <= warningPeriod) {
    endingPositions.push('president');
  }
  if ((secretaryEndDate - today) / (24 * 60 * 60 * 1000) <= warningPeriod) {
    endingPositions.push('secretary');
  }
  if ((treasurerEndDate - today) / (24 * 60 * 60 * 1000) <= warningPeriod) {
    endingPositions.push('treasurer');
  }
  
  return {
    hasEndingTenures: endingPositions.length > 0,
    endingPositions,
    daysRemaining: Math.min(
      Math.ceil((presidentEndDate - today) / (24 * 60 * 60 * 1000)),
      Math.ceil((secretaryEndDate - today) / (24 * 60 * 60 * 1000)),
      Math.ceil((treasurerEndDate - today) / (24 * 60 * 60 * 1000))
    )
  };
};

// Add indexes
sanghSchema.index({ level: 1 });
sanghSchema.index({ 'location.city': 1 });
sanghSchema.index({ 'location.district': 1 });
sanghSchema.index({ 'location.state': 1 });
sanghSchema.index({ parentSangh: 1 });

module.exports = mongoose.model('Sangh', sanghSchema);