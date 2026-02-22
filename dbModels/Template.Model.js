const mongoose = require('mongoose')

const templateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    data: {
      type: String,
      required: true
    },
    note: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Template', templateSchema)