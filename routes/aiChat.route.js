const express = require('express')
const { isAuthenticatedUser } = require('../middlewares/auth.middleware')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const {
  listSessions,
  createSession,
  createFocusLinkForSession,
  bootstrapFocusChat,
  validateFocusStreamAccess,
  getSession,
  renameSession,
  deleteSession,
  handleMessageTurn,
  handleFocusMessageTurn,
  streamMessage
} = require('../controllers/aiChat.controller')

const router = express.Router()

router.post('/focus/:routeKey/bootstrap', bootstrapFocusChat)
router.post('/focus/:routeKey/stream-access', validateFocusStreamAccess)
router.post('/focus/:routeKey/messages/turn', handleFocusMessageTurn)

router.use(isAuthenticatedUser)
router.use(requirePageAccess(PAGE_ACCESS_KEYS.AICHAT))

router.get('/', listSessions)
router.post('/', createSession)
router.post('/:sessionId/focus-link', createFocusLinkForSession)
router.get('/:sessionId', getSession)
router.patch('/:sessionId', renameSession)
router.delete('/:sessionId', deleteSession)
router.post('/:sessionId/messages/turn', handleMessageTurn)
router.post('/:sessionId/messages/stream', streamMessage)

module.exports = router
