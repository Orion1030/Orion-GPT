const { JobModel } = require('../dbModels')
const handlers = {}
const { JobDescriptionModel, ResumeModel, ProfileModel } = require('../dbModels')
const log = (...args) => console.log('[jobRunner]', ...args)

// Registerable handlers map (populated by agent modules)
exports.registerHandler = (type, fn) => {
  handlers[type] = fn
}

// Simple in-process job loop
let running = false
exports.start = () => {
  if (running) return
  running = true
  log('starting job runner (in-process)')
  setInterval(async () => {
    try {
      const job = await JobModel.findOneAndUpdate({ status: 'pending' }, { $set: { status: 'running' } }, { new: true })
      if (!job) return
      log('picked job', job._id.toString(), job.type)
      const handler = handlers[job.type]
      if (!handler) {
        job.status = 'failed'
        job.error = `No handler for job type ${job.type}`
        await job.save()
        return
      }
      try {
        // run handler with simple progress updater
        const updateProgress = async (p, partialResult) => {
          job.progress = p
          if (partialResult !== undefined) job.result = partialResult
          await job.save()
        }
        const result = await handler(job, updateProgress)
        job.status = 'completed'
        job.progress = 100
        job.result = result === undefined ? job.result : result
        await job.save()
        log('completed job', job._id.toString())
      } catch (e) {
        job.status = 'failed'
        job.error = String(e)
        await job.save()
        log('job failed', job._id.toString(), e)
      }
    } catch (e) {
      log('loop error', e)
    }
  }, 1000)
}

