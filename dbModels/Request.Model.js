const mongoose = require('mongoose')
const validator = require('validator')

const requestSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: Number
    },
    message: {
      type: String
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Request', requestSchema)
