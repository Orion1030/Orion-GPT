const mongoose = require('mongoose')
const { StatusCodes } = require('../utils/constants')

const contactInfoSchema = new mongoose.Schema({
  email: { type: String, trim: true },
  linkedin: { type: String, trim: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true }
}, { _id: false })

const experienceSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  roleTitle: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  location: { type: String },
  description: { type: String }
}, { _id: false })

const educationSchema = new mongoose.Schema({
  universityName: { type: String, required: true },
  degreeLevel: { type: String, required: true },
  major: { type: String },
  startDate: { type: Date },
  endDate: { type: Date }
}, { _id: false })

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    fullName: {
      type: String,
      required: true
    },
    stackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stack',
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    contactInfo: contactInfoSchema,
    experiences: [experienceSchema],
    education: [educationSchema],
    status: {
      type: Number,
      default: StatusCodes.INACTIVE
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Profile', profileSchema)