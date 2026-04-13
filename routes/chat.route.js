const express = require('express')
const { isAuthenticatedUser } = require('../middlewares/auth.middleware')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const {
  listSessions,
  createSession,
  getSession,
  renameSession,
  deleteSession,
  sendMessage
} = require('../controllers/chat.controller')

const router = express.Router()

router.use(isAuthenticatedUser)
router.use(requirePageAccess(PAGE_ACCESS_KEYS.CHAT))

router.get('/', listSessions)
router.post('/', createSession)
router.get('/:sessionId', getSession)
router.patch('/:sessionId', renameSession)
router.delete('/:sessionId', deleteSession)
router.post('/:sessionId/messages', sendMessage)

module.exports = router
