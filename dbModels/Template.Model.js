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
    },
    isBuiltIn: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      default: ''
    },
    layoutMode: {
      type: String,
      enum: ['single', 'hybrid'],
      default: 'single'
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Template', templateSchema)