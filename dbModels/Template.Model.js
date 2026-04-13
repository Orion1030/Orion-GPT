const mongoose = require('mongoose')

const templateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
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
