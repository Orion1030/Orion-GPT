const mongoose = require('mongoose')

const chatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatSession',
      required: true
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    content: {
      type: String,
      required: true,
      default: ''
    }
  ,
  structuredAssistantPayload: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
    default: null
  }
  },
  { timestamps: true }
)

module.exports = mongoose.model('ChatMessage', chatMessageSchema)
