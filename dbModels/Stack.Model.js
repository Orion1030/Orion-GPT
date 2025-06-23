const mongoose = require('mongoose')

const stackSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    note: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Stack', stackSchema)
