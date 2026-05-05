const mongoose = require('mongoose')

/** Chat type: normal (free chat), jd (job-description flow), existing_resume (resume-context flow) */
const CHAT_TYPES = ['normal', 'jd', 'existing_resume']

const chatSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: false,
      default: null
    },
    title: {
      type: String,
      required: true,
      default: 'New Chat'
    },
    jobDescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobDescription',
      required: false,
      default: null
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: false,
      default: null
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      required: false,
      default: null
    },
    chatType: {
      type: String,
      enum: CHAT_TYPES,
      default: 'normal'
    }
  },
  { timestamps: true }
)

const model = mongoose.model('ChatSession', chatSessionSchema)
model.CHAT_TYPES = CHAT_TYPES
module.exports = model
