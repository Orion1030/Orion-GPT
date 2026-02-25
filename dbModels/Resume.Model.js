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
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ experienceStrings: {}, skillsContent: '' })
    },
    builtInTemplateId: {
      type: String,
      default: null
    },
    pageFrameConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Resume', resumeSchema)