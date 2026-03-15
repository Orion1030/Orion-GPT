const express = require('express')
const { isAuthenticatedUser } = require('../middlewares/auth.middleware')
const { requireNoRunningJob } = require('../middlewares/requireNoRunningJob')
const { createJob, getJob, cancelJob } = require('../controllers/agent.controller')

const router = express.Router()
router.use(isAuthenticatedUser)

router.post('/jobs', requireNoRunningJob, createJob)
router.get('/jobs/:jobId', getJob)
router.delete('/jobs/:jobId', cancelJob)

module.exports = router

