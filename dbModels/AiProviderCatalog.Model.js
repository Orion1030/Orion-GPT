const mongoose = require('mongoose')

const PROVIDER_KEYS = ['openai', 'claude', 'gemini']

const aiProviderModelSchema = new mongoose.Schema(
  {
    modelId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    label: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    deprecatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
)

const aiProviderCatalogSchema = new mongoose.Schema(
  {
    providerKey: {
      type: String,
      enum: PROVIDER_KEYS,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    models: {
      type: [aiProviderModelSchema],
      default: [],
    },
    updatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'ai-provider-catalog',
  }
)

module.exports = mongoose.model('AiProviderCatalog', aiProviderCatalogSchema)
