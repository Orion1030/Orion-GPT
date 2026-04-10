const { runApplicationPipeline } = require('../services/applicationPipeline.service')

module.exports = async function applicationResumeGenerator(job, updateProgress) {
  const { applicationId } = job.payload || {}
  if (!applicationId) {
    throw new Error('applicationId is required for generate_application_resume jobs')
  }

  const userId = job.userId
  return runApplicationPipeline({
    applicationId,
    userId,
    jobId: job._id,
    updateProgress,
  })
}

