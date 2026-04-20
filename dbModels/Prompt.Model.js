const mongoose = require("mongoose");

const promptSchema = new mongoose.Schema(
  {
    promptName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 50,
    },
    context: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 100000,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      default: null,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

promptSchema.index({ promptName: 1, type: 1, owner: 1, profileId: 1 }, { unique: true });
promptSchema.index({ type: 1, promptName: 1, updatedAt: -1 });
promptSchema.index({ owner: 1, type: 1, promptName: 1, profileId: 1, updatedAt: -1 });

module.exports = mongoose.model("Prompt", promptSchema);
