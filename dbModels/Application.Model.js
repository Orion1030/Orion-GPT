const mongoose = require('mongoose')

const APPLICATION_STATUS = ['in_progress', 'applied', 'declined', 'cancelled']
const GENERATION_STATUS = ['pending', 'queued', 'running', 'completed', 'failed']
const RESUME_REFERENCE_MODES = ['use_top_match_resume', 'generate_from_scratch', 'use_specific_resume']
const PROFILE_SELECTION_MODES = ['auto', 'manual']
const PIPELINE_STEPS = [
  'created',
  'jd_parsed',
  'profile_selected',
  'base_resume_selected',
  'resume_generated',
  'resume_saved',
  'completed',
  'failed',
]
const JD_JOB_TYPE = ['full_time', 'part_time', 'permanent', 'contract', 'internship', 'other']
const JD_WORK_TYPE = ['remote', 'hybrid', 'on_site', 'other']
const JD_SALARY_TYPE = ['hourly', 'annual']

const applicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      default: null,
    },
    profileNameSnapshot: {
      type: String,
      default: '',
      trim: true,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      default: null,
    },
    resumeName: {
      type: String,
      default: '',
      trim: true,
    },
    baseResumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      default: null,
    },
    jobDescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobDescription',
      default: null,
    },
    companyName: {
      type: String,
      default: '',
      trim: true,
    },
    jobTitle: {
      type: String,
      default: '',
      trim: true,
    },
    applicationStatus: {
      type: String,
      enum: APPLICATION_STATUS,
      default: 'in_progress',
    },
    generationStatus: {
      type: String,
      enum: GENERATION_STATUS,
      default: 'pending',
    },
    applyConfig: {
      resumeReferenceMode: {
        type: String,
        enum: RESUME_REFERENCE_MODES,
        default: 'use_top_match_resume',
      },
      profileSelectionMode: {
        type: String,
        enum: PROFILE_SELECTION_MODES,
        default: 'auto',
      },
      manualProfileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Profile',
        default: null,
      },
      manualResumeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resume',
        default: null,
      },
      selectedTemplateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Template',
        default: null,
      },
    },
    pipeline: {
      jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        default: null,
      },
      currentStep: {
        type: String,
        enum: PIPELINE_STEPS,
        default: 'created',
      },
      progress: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      lastError: {
        type: String,
        default: '',
      },
      startedAt: {
        type: Date,
        default: null,
      },
      completedAt: {
        type: Date,
        default: null,
      },
    },
    jdContext: {
      type: String,
      default: '',
    },
    jdMeta: {
      jobType: {
        type: String,
        enum: JD_JOB_TYPE,
        default: 'other',
      },
      workType: {
        type: String,
        enum: JD_WORK_TYPE,
        default: 'other',
      },
      salary: {
        salaryType: {
          type: String,
          enum: JD_SALARY_TYPE,
          default: null,
        },
        min: {
          type: Number,
          default: null,
        },
        max: {
          type: Number,
          default: null,
        },
        currency: {
          type: String,
          default: 'USD',
        },
      },
    },
    chatSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatSession',
      default: null,
    },
    atsScore: {
      type: Number,
      default: null,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    historySequence: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },

    // Legacy fields kept for backwards compatibility during migration rollout.
    stackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stack',
      default: null,
    },
    jobUrl: {
      type: String,
      default: '',
      trim: true,
    },
    platform: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      default: 'Applied',
      trim: true,
    },
    skillMatchPercent: {
      type: Number,
      default: 0,
    },
    note: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
)

applicationSchema.index({ userId: 1, createdAt: -1 })
applicationSchema.index({ userId: 1, applicationStatus: 1, createdAt: -1 })
applicationSchema.index({ userId: 1, generationStatus: 1, createdAt: -1 })
applicationSchema.index({ userId: 1, profileId: 1, createdAt: -1 })
applicationSchema.index({ 'pipeline.jobId': 1 })

const model = mongoose.model('Application', applicationSchema)
model.APPLICATION_STATUS = APPLICATION_STATUS
model.GENERATION_STATUS = GENERATION_STATUS
model.RESUME_REFERENCE_MODES = RESUME_REFERENCE_MODES
model.PROFILE_SELECTION_MODES = PROFILE_SELECTION_MODES
model.PIPELINE_STEPS = PIPELINE_STEPS
module.exports = model
