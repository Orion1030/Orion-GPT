const mongoose = require('mongoose')

const PROMPT_AUDIT_ACTIONS = [
  'prompt_created',
  'prompt_updated',
  'prompt_deleted',
  'prompt_reset',
  'prompt_rolled_back',
  'prompt_runtime_used',
]

const PROMPT_AUDIT_ACTOR_TYPES = ['user', 'admin', 'system']

const promptAuditSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorType: {
      type: String,
      enum: PROMPT_AUDIT_ACTOR_TYPES,
      required: true,
      default: 'system',
    },
    action: {
      type: String,
      enum: PROMPT_AUDIT_ACTIONS,
      required: true,
      index: true,
    },
    promptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prompt',
      default: null,
      index: true,
    },
    promptName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 50,
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      default: null,
      index: true,
    },
    beforeContext: {
      type: String,
      default: null,
      maxlength: 120000,
    },
    afterContext: {
      type: String,
      default: null,
      maxlength: 120000,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    meta: {
      requestId: {
        type: String,
        default: null,
      },
      source: {
        type: String,
        default: 'system',
      },
      ip: {
        type: String,
        default: '',
      },
      userAgent: {
        type: String,
        default: '',
      },
      eventVersion: {
        type: Number,
        default: 1,
      },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

promptAuditSchema.index({ ownerUserId: 1, createdAt: -1 })
promptAuditSchema.index({ ownerUserId: 1, promptName: 1, type: 1, profileId: 1, createdAt: -1 })
promptAuditSchema.index({ promptId: 1, createdAt: -1 })
promptAuditSchema.index({ action: 1, createdAt: -1 })
promptAuditSchema.index(
  { ownerUserId: 1, action: 1, 'meta.requestId': 1 },
  {
    partialFilterExpression: {
      'meta.requestId': { $type: 'string' },
    },
  }
)

const model = mongoose.model('PromptAudit', promptAuditSchema)
model.PROMPT_AUDIT_ACTIONS = PROMPT_AUDIT_ACTIONS
model.PROMPT_AUDIT_ACTOR_TYPES = PROMPT_AUDIT_ACTOR_TYPES
module.exports = model
