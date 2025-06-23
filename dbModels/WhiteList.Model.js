const mongoose = require('mongoose')

const whiteListSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      required: true
    },
    domain: {
      type: String,
      required: true,
      trim: true
    },
    applySelector: {
      type: String,
      required: true,
      default: 'a[href="/apply"]'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    description: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('WhiteList', whiteListSchema)