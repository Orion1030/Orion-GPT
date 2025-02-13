const mongoose = require('mongoose')
const validator = require('validator')
const bcrypt = require('bcryptjs')
const { ObjectId } = require('mongodb')
const { RoleLevels } = require('../utils/constants')

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String
    },
    email: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (value) => {
          return validator.isEmail(value)
        },
        message: 'Email address should be a valid email address format'
      }
    },
    password: {
      type: String,
      minlength: 8,
      validate: {
        validator: (value) => {
          return /(?=.*[A-Z|!@#$&*])(?!.*[ ]).*$/g.test(value)
        },
        message: 'Password should contain at least 1 capital or 1 special character, be a minimum length of 8, and not contain spaces'
      }
    },
    signupConfirmed: {
      type: Boolean,
      default: false
    },
    role: {
      type: Number,
      default: RoleLevels.MEMBER
    }
  },
  { timestamps: true }
)

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next()
  }
  this.password = await bcrypt.hash(this.password, 10)
})

userSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) return false
  return await bcrypt.compare(enteredPassword, this.password)
}

module.exports = mongoose.model('User', userSchema)
