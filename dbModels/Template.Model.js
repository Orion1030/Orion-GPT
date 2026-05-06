const mongoose = require('mongoose')

const templateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    name: {
      type: String,
      required: true
    },
    templateType: {
      type: String,
      enum: ['resume', 'cover_letter'],
      default: 'resume',
      index: true
    },
    data: {
      type: String,
      required: true
    },
    note: {
      type: String,
      default: ''
    },
    isBuiltIn: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      default: ''
    },
    layoutMode: {
      type: String,
      enum: ['single', 'hybrid'],
      default: 'single'
    },
    templateEngine: {
      type: String,
      enum: ['ejs', 'legacy'],
      default: 'ejs',
      index: true
    },
    migrationStatus: {
      type: String,
      enum: ['ready', 'converted', 'needs_admin_review'],
      default: 'ready',
      index: true
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Template', templateSchema)
