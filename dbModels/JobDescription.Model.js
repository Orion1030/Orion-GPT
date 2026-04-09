const mongoose = require('mongoose')

const jobDescriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    title: {
      type: String,
      required: true,
      default: ''
    },
    company: {
      type: String,
      default: ''
    },
    skills: {
      type: [String],
      default: []
    },
    requirements: {
      type: [String],
      default: []
    },
    responsibilities: {
      type: [String],
      default: []
    },
    niceToHave: {
      type: [String],
      default: []
    },
    context: {
      type: String,
      default: ''
    },
    contextHash: {
      type: String,
      default: ''
    },
    embedding: {
      type: [Number],
      default: null
    },
    normalizedHash: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
)

jobDescriptionSchema.index({ userId: 1, normalizedHash: 1 })
jobDescriptionSchema.index({ userId: 1, contextHash: 1 })

module.exports = mongoose.model('JobDescription', jobDescriptionSchema)
