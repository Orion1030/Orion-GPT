const mongoose = require('mongoose')

const resumeTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    data: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('ResumeTemplate', resumeTemplateSchema)