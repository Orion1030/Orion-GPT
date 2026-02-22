const mongoose = require('mongoose')

const stackSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    primarySkills: {
      type: [String],
      required: true,
    },
    SecondarySkills: {
      type: [String],
      required: true,
    },
    note: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Stack', stackSchema)
