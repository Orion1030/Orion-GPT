const mongoose = require('mongoose')

function normalizeTeamName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function toTeamKey(name) {
  return normalizeTeamName(name).toUpperCase()
}

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    teamKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    managerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
)

teamSchema.pre('validate', function setTeamKey() {
  this.name = normalizeTeamName(this.name)
  this.teamKey = toTeamKey(this.name)
})

teamSchema.index({ name: 1 })

module.exports = mongoose.model('Team', teamSchema)
