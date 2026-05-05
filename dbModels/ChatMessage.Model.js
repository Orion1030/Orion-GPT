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
    },
    turnId: {
      type: String,
      required: false,
      default: null,
      index: true
    },
    structuredAssistantPayload: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
      default: null
    }
  },
  { timestamps: true }
)

chatMessageSchema.index(
  { sessionId: 1, turnId: 1, role: 1 },
  {
    unique: true,
    partialFilterExpression: { turnId: { $type: 'string' } }
  }
)

module.exports = mongoose.model('ChatMessage', chatMessageSchema)
