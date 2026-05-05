const mongoose = require('mongoose')

const RESUME_GENERATION_MODES = ['legacy', 'reasoning']
const RESUME_GENERATION_PIPELINE_VERSIONS = ['legacy-v1', 'reasoning-v1']
const RUN_STATUSES = ['running', 'completed', 'failed', 'fallback']

const resumeGenerationRunSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      default: null,
    },
    baseResumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      default: null,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      default: null,
    },
    jobDescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobDescription',
      default: null,
    },
    configuredMode: {
      type: String,
      enum: RESUME_GENERATION_MODES,
      required: true,
      default: 'legacy',
    },
    effectiveMode: {
      type: String,
      enum: RESUME_GENERATION_MODES,
      required: true,
      default: 'legacy',
    },
    pipelineVersion: {
      type: String,
      enum: RESUME_GENERATION_PIPELINE_VERSIONS,
      required: true,
      default: 'legacy-v1',
    },
    provider: {
      type: String,
      enum: ['openai', 'claude', 'gemini', 'builtin', 'unknown'],
      default: 'builtin',
    },
    model: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    status: {
      type: String,
      enum: RUN_STATUSES,
      required: true,
      default: 'running',
    },
    fallbackReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    stepTimings: {
      type: Map,
      of: Number,
      default: () => ({}),
    },
    usage: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'resume-generation-runs',
  }
)

resumeGenerationRunSchema.index({ ownerUserId: 1, createdAt: -1 })
resumeGenerationRunSchema.index({ profileId: 1, createdAt: -1 })

module.exports = mongoose.model('ResumeGenerationRun', resumeGenerationRunSchema)
