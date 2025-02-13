const mongoose = require('mongoose')
const validator = require('validator')
const { ObjectId } = require('mongodb')

const promptSchema = new mongoose.Schema(
  {
    user: {
      type: ObjectId,
      ref: 'User'
    },
    title: {
      type: String,
      required: true,
    },
    prompt: {
      type: String,
      required: true,
      validate: {
        validator: (value) => {
          return validator.isLength(value, { min: 10 })
        },
        message: 'Prompt should be a minimum length of 10'
      }
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Prompt', promptSchema)
