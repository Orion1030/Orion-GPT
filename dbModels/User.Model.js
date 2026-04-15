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
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true
    },
    contactNumber: {
      type: String,
      default: '',
      trim: true
    },
    avatarUrl: {
      type: String,
      default: '',
      trim: true
    },
    avatarStorageKey: {
      type: String,
      default: '',
      trim: true
    },
    avatarUpdatedAt: {
      type: Date,
      default: null
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
    lastLogin: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: false
    },
    role: {
      type: Number,
      required: true,
      default: RoleLevels.User
    }
  },
  { timestamps: true }
)

userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10)
  }
})

// Password check method
userSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) return false
  return await bcrypt.compare(enteredPassword, this.password)
}

module.exports = mongoose.model('User', userSchema)
