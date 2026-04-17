const mongoose = require('mongoose')
const { StatusCodes } = require('../utils/constants')

const contactInfoSchema = new mongoose.Schema({
  email: { type: String },
  linkedin: { type: String },
  github: { type: String },
  website: { type: String },
  phone: { type: String },
  address: { type: String }
}, { _id: false })

const careerHistorySchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  roleTitle: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  companySummary: { type: String, maxlength: 3000 },
  keyPoints: { type: String, default: "" }
}, { _id: false })

const educationSchema = new mongoose.Schema({
  universityName: { type: String, required: true },
  degreeLevel: { type: String, required: true },
  major: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  note: { type: String }
}, { _id: false })

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    defaultTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template',
      default: null
    },
    fullName: {
      type: String,
      required: true
    },
    mainStack: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    link: {
      type: String,
      trim: true
    },
    contactInfo: contactInfoSchema,
    careerHistory: [careerHistorySchema],
    educations: [educationSchema],
    status: {
      type: Number,
      default: StatusCodes.INACTIVE
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Profile', profileSchema)
