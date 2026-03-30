const mongoose = require('mongoose')

const resumeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: true
    },
    stackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stack',
      required: false
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template',
      required: false
    },
    note: {
      type: String,
      default: ''
    },
    summary: {
      type: String,
      default: ''
    },
    // New structured fields for resume-specific data
    experiences: {
      type: [
        {
          title: { type: String, default: '' },
          companyName: { type: String, default: '' },
          companyLocation: { type: String, default: '' },
          summary: { type: String, default: '' },
          descriptions: { type: [String], default: [] },
          startDate: { type: String, default: '' },
          endDate: { type: String, default: '' },
        },
      ],
      default: [],
    },
    skills: {
      type: [
        {
          title: { type: String, default: 'Skills' },
          items: { type: [String], default: [] },
        },
      ],
      default: [],
    },
    education: {
      type: [
        {
          degreeLevel: { type: String, default: '' },
          universityName: { type: String, default: '' },
          major: { type: String, default: '' },
          startDate: { type: String, default: '' },
          endDate: { type: String, default: '' },
        },
      ],
      default: [],
    },
    // Cloud / indexing fields
    cloudPrimary: {
      type: String,
      default: ''
    },
    cloudSecondary: {
      type: [String],
      default: []
    },
    builtInTemplateId: {
      type: String,
      default: null
    },
    pageFrameConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    embedding: {
      type: [Number],
      default: null
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Resume', resumeSchema)
