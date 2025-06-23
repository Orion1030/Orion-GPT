const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const { RoleLevels } = require('../utils/constants')

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    team: {
      type: String,
      default: '', // optional
      trim: true
    },
    passwordHash: {
      type: String,
      minlength: 8,
      validate: {
        validator: (value) => {
          return /(?=.*[A-Z|!@#$&*])(?!.*[ ]).*$/g.test(value)
        },
        message: 'Password should contain at least 1 capital or 1 special character, be a minimum length of 8, and not contain spaces'
      }
    },
    token: {
      type: String,
      default: ''
    },
    lastLogin: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: false
    },
    role: {
      type: String,
      required: true,
      default: RoleLevels.MEMBER
    }
  },
  { timestamps: true }
)

userSchema.pre('save', async function (next) {
  if (this.isModified('passwordHash')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 10)
  }
  next()
})

// Password check method
userSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.passwordHash) return false
  return await bcrypt.compare(enteredPassword, this.passwordHash)
}

module.exports = mongoose.model('User', userSchema)
