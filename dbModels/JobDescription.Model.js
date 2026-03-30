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
    embedding: {
      type: [Number],
      default: null
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('JobDescription', jobDescriptionSchema)
