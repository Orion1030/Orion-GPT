const mongoose = require('mongoose')

const chatSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    title: {
      type: String,
      required: true,
      default: 'New Chat'
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('ChatSession', chatSessionSchema)
