/**
 * Agenda-based job runner (MongoDB-backed).
 * Exposes the same interface as jobRunner.js so switching is a one-line change.
 *
 * To enable: in your server entry point, replace:
 *   const { registerHandler, start } = require('./workers/jobRunner')
 * with:
 *   const { registerHandler, start } = require('./workers/agendaRunner')
 */
const { Agenda } = require('@hokify/agenda')
const { JobModel } = require('../dbModels')

const log = (...args) => console.log('[agendaRunner]', ...args)

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI

const agenda = new Agenda({
  db: { address: MONGO_URI, collection: 'agendaJobs' },
  processEvery: '2 seconds',
  maxConcurrency: parseInt(process.env.AGENDA_MAX_CONCURRENCY || '4', 10),
})

const handlers = {}

exports.registerHandler = (type, fn) => {
  handlers[type] = fn

  agenda.define(type, { priority: 'normal', concurrency: 2 }, async (job) => {
    const { jobModelId } = job.attrs.data || {}
    if (!jobModelId) throw new Error('Missing jobModelId in agenda job data')

    const jobDoc = await JobModel.findByIdAndUpdate(
      jobModelId,
      { $set: { status: 'running' } },
      { returnDocument: 'after' }
    )
    if (!jobDoc) throw new Error(`JobModel ${jobModelId} not found`)

    const updateProgress = async (progress, partialResult) => {
      const upd = { progress }
      if (partialResult !== undefined) upd.result = partialResult
      await JobModel.findByIdAndUpdate(jobModelId, { $set: upd })
    }

    try {
      const result = await fn(jobDoc, updateProgress)
      await JobModel.findByIdAndUpdate(jobModelId, {
        $set: { status: 'completed', progress: 100, result: result ?? jobDoc.result },
      })
      log('completed', jobModelId)
    } catch (err) {
      await JobModel.findByIdAndUpdate(jobModelId, {
        $set: { status: 'failed', error: String(err) },
      })
      log('failed', jobModelId, err)
      throw err
    }
  })
}

/**
 * Schedule a JobModel document to run via Agenda.
 * Call after creating and saving the JobModel doc.
 */
exports.scheduleJob = async (jobDoc) => {
  await agenda.now(jobDoc.type, { jobModelId: jobDoc._id.toString() })
}

let started = false
exports.start = async () => {
  if (started) return
  started = true

  await agenda.start()
  log('Agenda started, listening for jobs')

  // Bridge: pick up any JobModel docs that were created before Agenda was ready
  // (e.g. during startup race condition)
  setInterval(async () => {
    const pending = await JobModel.find({ status: 'pending' }).limit(10).lean()
    for (const doc of pending) {
      log('bridging pending job', doc._id.toString(), doc.type)
      await JobModel.findByIdAndUpdate(doc._id, { $set: { status: 'running' } })
      await agenda.now(doc.type, { jobModelId: doc._id.toString() }).catch((e) =>
        log('bridge schedule error', e)
      )
    }
  }, 5000)

  process.on('SIGTERM', () => agenda.stop())
  process.on('SIGINT', () => agenda.stop())
}
