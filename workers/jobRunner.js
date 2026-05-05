const { DBConnection, JobModel } = require('../dbModels')
const handlers = {}
const log = (...args) => console.log('[jobRunner]', ...args)
const POLL_INTERVAL_MS = 1000
const DB_READY_STATE_CONNECTED = 1

// Registerable handlers map (populated by agent modules)
exports.registerHandler = (type, fn) => {
  handlers[type] = fn
}

// Simple in-process job loop
let running = false
let timer = null
let tickInFlight = false
let lastLoggedDbState = null

const describeReadyState = (state) => {
  switch (Number(state)) {
    case 0:
      return 'disconnected'
    case 1:
      return 'connected'
    case 2:
      return 'connecting'
    case 3:
      return 'disconnecting'
    default:
      return `unknown(${state})`
  }
}

const scheduleNext = (delayMs = POLL_INTERVAL_MS) => {
  if (!running) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(runOnce, delayMs)
}

const handleDbUnavailable = () => {
  const state = Number(DBConnection.readyState)
  if (lastLoggedDbState !== state) {
    log('waiting for Mongo connection:', describeReadyState(state))
    lastLoggedDbState = state
  }
}

const handleDbConnected = () => {
  if (lastLoggedDbState !== DB_READY_STATE_CONNECTED) {
    log('Mongo connection ready; resuming job polling')
    lastLoggedDbState = DB_READY_STATE_CONNECTED
  }
}

const runOnce = async () => {
  if (!running) return
  if (tickInFlight) {
    scheduleNext()
    return
  }

  tickInFlight = true
  try {
    if (Number(DBConnection.readyState) !== DB_READY_STATE_CONNECTED) {
      handleDbUnavailable()
      return
    }

    handleDbConnected()

    const job = await JobModel.findOneAndUpdate(
      { status: 'pending' },
      { $set: { status: 'running' } },
      { returnDocument: 'after' }
    )
    if (!job) return

    log('picked job', job._id.toString(), job.type)
    const handler = handlers[job.type]
    if (!handler) {
      await JobModel.findByIdAndUpdate(job._id, { $set: { status: 'failed', error: `No handler for job type ${job.type}` } })
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
  } finally {
    tickInFlight = false
    scheduleNext()
  }
}

exports.start = () => {
  if (running) return
  running = true
  log('starting job runner (in-process)')
  scheduleNext(0)
}
