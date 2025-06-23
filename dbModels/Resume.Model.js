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
      required: true
    },
    resumeTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ResumeTemplate',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    fileUrl: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Resume', resumeSchema)