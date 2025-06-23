const mongoose = require('mongoose')

const blackListSchema = new mongoose.Schema(
  {
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: true
    },
    jobs: {
      type: [String],
      default: []
    },
    companyName: {
      type: String,
      required: true
    },
    reason: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('BlackList', blackListSchema)