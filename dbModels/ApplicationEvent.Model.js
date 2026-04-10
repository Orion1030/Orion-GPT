const mongoose = require('mongoose')

const APPLICATION_EVENT_TYPES = [
  'created',
  'field_updated',
  'status_updated',
  // Legacy pipeline history events (keep for existing rows)
  'pipeline_step',
  'pipeline_failed',
  'pipeline_completed',
  // Canonical pipeline history events (match realtime envelope types)
  'application.pipeline_step',
  'application.failed',
  'application.completed',
  'chat_linked',
  'chat_opened',
  'download_pdf',
  'download_docx',
]

const APPLICATION_EVENT_ACTOR_TYPES = ['user', 'system', 'ai']

const applicationEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: APPLICATION_EVENT_TYPES,
      required: true,
    },
    actorType: {
      type: String,
      enum: APPLICATION_EVENT_ACTOR_TYPES,
      default: 'system',
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
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
      eventVersion: {
        type: Number,
        default: 1,
      },
      sequence: {
        type: Number,
        required: true,
      },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

applicationEventSchema.index({ applicationId: 1, createdAt: -1 })
applicationEventSchema.index({ applicationId: 1, 'meta.sequence': -1 })
applicationEventSchema.index({ userId: 1, createdAt: -1 })
applicationEventSchema.index(
  { applicationId: 1, 'meta.requestId': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'meta.requestId': { $type: 'string' },
    },
  }
)

const model = mongoose.model('ApplicationEvent', applicationEventSchema)
model.APPLICATION_EVENT_TYPES = APPLICATION_EVENT_TYPES
model.APPLICATION_EVENT_ACTOR_TYPES = APPLICATION_EVENT_ACTOR_TYPES
module.exports = model
