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
const APPLICATION_EVENT_TYPES = [
  'created',
  'field_updated',
  'status_updated',
  // Legacy pipeline history events (keep for compatibility)
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

const LEGACY_PIPELINE_EVENT_TO_CANONICAL = {
  pipeline_step: 'application.pipeline_step',
  pipeline_failed: 'application.failed',
  pipeline_completed: 'application.completed',
}

const LEGACY_STATUS_TO_APPLICATION = {
  Applied: 'applied',
  Rejected: 'declined',
  'Phone Screen': 'in_progress',
  Interview: 'in_progress',
  Offer: 'in_progress',
}

const APPLICATION_TO_LEGACY_STATUS = {
  in_progress: 'Phone Screen',
  applied: 'Applied',
  declined: 'Rejected',
  cancelled: 'Rejected',
}

function toCanonicalApplicationStatus(value) {
  if (APPLICATION_STATUS.includes(value)) return value
  return LEGACY_STATUS_TO_APPLICATION[value] || 'in_progress'
}

function toLegacyStatus(value) {
  return APPLICATION_TO_LEGACY_STATUS[value] || 'Applied'
}

function toCanonicalGenerationStatus(value) {
  if (value === 'not_started') return 'pending'
  if (GENERATION_STATUS.includes(value)) return value
  return 'pending'
}

function toObjectIdString(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function normalizeApplyConfig(input) {
  const raw = input && typeof input === 'object' ? input : {}
  let resumeReferenceMode = raw.resumeReferenceMode
  let profileSelectionMode = raw.profileSelectionMode
  let manualProfileId = toObjectIdString(raw.manualProfileId)
  let manualResumeId = toObjectIdString(raw.manualResumeId)
  let selectedTemplateId = toObjectIdString(raw.selectedTemplateId)

  if (!resumeReferenceMode || !profileSelectionMode) {
    const legacyResumeRef = raw.resumeReference
    const legacyProfileRef = raw.profileReference

    if (!resumeReferenceMode) {
      if (legacyResumeRef === 'None') resumeReferenceMode = 'generate_from_scratch'
      else if (legacyResumeRef === 'Auto' || legacyResumeRef == null) resumeReferenceMode = 'use_top_match_resume'
      else {
        resumeReferenceMode = 'use_specific_resume'
        manualResumeId = toObjectIdString(legacyResumeRef)
      }
    }

    if (!profileSelectionMode) {
      if (legacyProfileRef === 'Auto' || legacyProfileRef == null) profileSelectionMode = 'auto'
      else {
        profileSelectionMode = 'manual'
        manualProfileId = toObjectIdString(legacyProfileRef)
      }
    }
  }

  if (!RESUME_REFERENCE_MODES.includes(resumeReferenceMode)) {
    resumeReferenceMode = 'use_top_match_resume'
  }
  if (!PROFILE_SELECTION_MODES.includes(profileSelectionMode)) {
    profileSelectionMode = 'auto'
  }

  if (profileSelectionMode !== 'manual') manualProfileId = null
  if (resumeReferenceMode !== 'use_specific_resume') manualResumeId = null

  return {
    resumeReferenceMode,
    profileSelectionMode,
    manualProfileId,
    manualResumeId,
    selectedTemplateId,
  }
}

function sanitizeString(value) {
  if (value == null) return ''
  return String(value).trim()
}

function toCanonicalApplicationEventType(value) {
  const text = sanitizeString(value)
  if (!text) return text
  return LEGACY_PIPELINE_EVENT_TO_CANONICAL[text] || text
}

module.exports = {
  APPLICATION_STATUS,
  GENERATION_STATUS,
  RESUME_REFERENCE_MODES,
  PROFILE_SELECTION_MODES,
  PIPELINE_STEPS,
  APPLICATION_EVENT_TYPES,
  LEGACY_STATUS_TO_APPLICATION,
  APPLICATION_TO_LEGACY_STATUS,
  toCanonicalApplicationStatus,
  toCanonicalGenerationStatus,
  toCanonicalApplicationEventType,
  toLegacyStatus,
  normalizeApplyConfig,
  toObjectIdString,
  sanitizeString,
}
