const express = require('express')
const { isAuthenticatedUser } = require('../middlewares/auth.middleware')
const { updateStructured } = require('../controllers/message.controller')

const router = express.Router()
router.use(isAuthenticatedUser)

router.patch('/:messageId/structured', updateStructured)

module.exports = router

