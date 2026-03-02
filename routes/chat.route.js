const express = require('express')
const { isAuthenticatedUser } = require('../middlewares/auth.middleware')
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
router.post('/jd/parse', parseJD)
router.post('/jd/store', storeJD)
router.post('/jd/find-resumes', findTopResumes)
router.post('/jd/generate-resume', generateResumeFromJD)
router.post('/jd/refine-resume', refineResume)

module.exports = router
