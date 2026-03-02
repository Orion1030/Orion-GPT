const mongoose = require('mongoose')

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
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('ChatSession', chatSessionSchema)
