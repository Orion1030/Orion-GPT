const express = require('express')
const { isAuthenticatedUser } = require('../middlewares/auth.middleware')
const { requireNoRunningJob } = require('../middlewares/requireNoRunningJob')
const {
  listSessions,
  createSession,
  getSession,
  renameSession,
  deleteSession,
  sendMessage
} = require('../controllers/chat.controller')
const {
  parseJD,
  storeJD,
  findTopResumes,
  importJdAndMatch,
  generateResumeFromJD,
  refineResume
} = require('../controllers/jd.controller')

const router = express.Router()

router.use(isAuthenticatedUser)

router.get('/', listSessions)
router.post('/', createSession)
router.get('/:sessionId', getSession)
router.patch('/:sessionId', renameSession)
router.delete('/:sessionId', deleteSession)
router.post('/:sessionId/messages', sendMessage)

// JD flow endpoints (must be before :sessionId to avoid conflict)
// Block these when a job is already running so frontend doesn't send duplicate requests
router.post('/jd/parse', requireNoRunningJob, parseJD)
router.post('/jd/store', storeJD)
router.post('/jd/find-resumes', requireNoRunningJob, findTopResumes)
router.post('/jd/import-and-match', requireNoRunningJob, importJdAndMatch)
router.post('/jd/generate-resume', requireNoRunningJob, generateResumeFromJD)
router.post('/jd/refine-resume', requireNoRunningJob, refineResume)

module.exports = router
