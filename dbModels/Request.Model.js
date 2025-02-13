const mongoose = require('mongoose')
const validator = require('validator')

const requestSchema = new mongoose.Schema(
  {
    from: {
      type: String,
      required: true,
      validate: {
        validator: (value) => {
          return validator.isEmail(value)
        },
        message: 'Email address should be a valid email address format'
      }
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
