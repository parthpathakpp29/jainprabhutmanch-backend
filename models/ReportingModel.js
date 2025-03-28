const mongoose = require('mongoose');

const reportingSchema = new mongoose.Schema(
  {
    // Sangh Information
    submittingSanghId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HierarchicalSangh',
      required: true
    },
    recipientSanghId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HierarchicalSangh',
      required: true
    },
    // Basic Information
    ikaiName: { 
      type: String, 
      required: true 
    },
    presidentName: { 
      type: String, 
      required: true 
    },
    secretaryName: { 
      type: String, 
      required: true 
    },
    treasurerName: { 
      type: String, 
      required: true 
    },
    // Reporting Period
    reportMonth: { 
      type: Number, 
      required: true,
      min: 1,
      max: 12
    },
    reportYear: { 
      type: Number, 
      required: true 
    },
    // Meeting Information
    generalMeetingCount: { 
      type: Number, 
      required: true,
      default: 0
    },
    boardMeetingCount: { 
      type: Number, 
      required: true,
      default: 0
    },
    // Membership Information
    membership: { 
      type: String, 
      required: true 
    },
    jainAadharCount: {
      type: Number,
      required: true,
      default: 0
    },
    // Activities
    projects: { 
      type: String, 
      required: true 
    },
    events: { 
      type: String, 
      required: true 
    },
    // Status
    status: {
      type: String,
      enum: ['submitted', 'reviewed', 'approved'],
      default: 'submitted'
    },
    feedback: {
      type: String,
      default: ''
    },
    // Submission Information
    submittedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

// Add to the bottom of your schema definition
reportingSchema.index({ submittingSanghId: 1 });
reportingSchema.index({ recipientSanghId: 1 });
reportingSchema.index({ status: 1 });
reportingSchema.index({ reportMonth: 1, reportYear: 1 });
reportingSchema.index({ submittedById: 1 });
// Compound indexes
reportingSchema.index({ recipientSanghId: 1, status: 1 });
reportingSchema.index({ reportMonth: 1, reportYear: 1, status: 1 });

module.exports = mongoose.model('Reporting', reportingSchema);
