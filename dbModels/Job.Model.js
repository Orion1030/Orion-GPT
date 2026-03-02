const mongoose = require('mongoose')

const jobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      required: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending'
    },
    progress: {
      type: Number,
      default: 0
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    error: {
      type: String,
      default: null
    },
    workerPid: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Job', jobSchema)

