const express = require('express')
const { isAuthenticatedUser } = require('../middlewares/auth.middleware')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const { updateStructured } = require('../controllers/message.controller')

const router = express.Router()
router.use(isAuthenticatedUser)
router.use(requirePageAccess(PAGE_ACCESS_KEYS.AICHAT))

router.patch('/:messageId/structured', updateStructured)

module.exports = router
