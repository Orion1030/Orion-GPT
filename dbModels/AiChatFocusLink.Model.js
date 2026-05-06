const mongoose = require('mongoose')

const aiChatFocusLinkSchema = new mongoose.Schema(
  {
    routeKeyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    pairHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatSession',
      required: true,
      index: true,
    },
    sessionUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    absoluteExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      required: false,
      default: null,
      index: true,
    },
    useCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
)

aiChatFocusLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
aiChatFocusLinkSchema.index({ sessionId: 1, revokedAt: 1, expiresAt: 1 })

module.exports = mongoose.model('AiChatFocusLink', aiChatFocusLinkSchema)
