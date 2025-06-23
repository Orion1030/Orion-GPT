const mongoose = require('mongoose')

const stackSchema = new mongoose.Schema(
  {
    userId:  {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    stackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stack'
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true
    },
    companyName: {
      type: String,
      required: true,
      trim: true
    },
    jobUrl: {
      type: String,
      required: true,
      trim: true
    },
    platform: {
      type: String,
      required: true,
      trim: true
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume'
    },
    status: {
      type: String,
      required: true,
      trim: true
    },
    skillMatchPercent:{
      type: Number,
      required: true,
      trim: true
    },
    notes: {
      type: String,
      default: '',
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Stack', stackSchema)
