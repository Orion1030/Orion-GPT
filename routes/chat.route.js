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

const router = express.Router()

router.use(isAuthenticatedUser)

router.get('/', listSessions)
router.post('/', createSession)
router.get('/:sessionId', getSession)
router.patch('/:sessionId', renameSession)
router.delete('/:sessionId', deleteSession)
router.post('/:sessionId/messages', sendMessage)

module.exports = router
