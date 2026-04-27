const mongoose = require('mongoose')

const AI_PROVIDERS = ['openai', 'claude', 'gemini']

const adminConfigurationSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    aiProvider: {
      type: String,
      enum: AI_PROVIDERS,
      default: 'openai',
      trim: true,
      lowercase: true,
    },
    model: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    encryptedApiKey: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4096,
    },
    isCustomAiEnabled: {
      type: Boolean,
      default: true,
    },
    useForResumeGeneration: {
      type: Boolean,
      default: false,
    },
    useForAiChat: {
      type: Boolean,
      default: false,
    },
    updatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'admin-configuration',
  }
)

module.exports = mongoose.model('AdminConfiguration', adminConfigurationSchema)
