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
        await JobModel.findByIdAndUpdate(job._id, { $set: { status: 'failed', error: `No handler for job type ${job.type}` } });
        return
      }
      try {
        // run handler with simple progress updater
        const updateProgress = async (p, partialResult) => {
          const upd = { progress: p }
          if (partialResult !== undefined) upd.result = partialResult
          // Use atomic update to avoid parallel saves on the same document
          await JobModel.findByIdAndUpdate(job._id, { $set: upd })
          // keep local doc in sync for handlers that inspect job after progress updates
          job.progress = p
          if (partialResult !== undefined) job.result = partialResult
        }
        const result = await handler(job, updateProgress)
        // finalize using atomic update
        await JobModel.findByIdAndUpdate(job._id, { $set: { status: 'completed', progress: 100, result: result === undefined ? job.result : result } })
        log('completed job', job._id.toString())
      } catch (e) {
        await JobModel.findByIdAndUpdate(job._id, { $set: { status: 'failed', error: String(e) } })
        log('job failed', job._id.toString(), e)
      }
    } catch (e) {
      log('loop error', e)
    }
  }, 1000)
}

