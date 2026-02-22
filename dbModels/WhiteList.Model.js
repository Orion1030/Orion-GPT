const mongoose = require('mongoose')

const whitelistSchema = new mongoose.Schema(
  {
    creater: {
      type: String,
      required: true
    },
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
    note: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Whitelist', whitelistSchema)