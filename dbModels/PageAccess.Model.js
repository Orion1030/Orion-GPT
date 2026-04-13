const mongoose = require("mongoose");
const { RoleLevels } = require("../utils/constants");
const { getPageAccessKeys } = require("../utils/pageAccess");

const pageAccessSchema = new mongoose.Schema(
  {
    pageKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      enum: getPageAccessKeys(),
    },
    pageName: {
      type: String,
      required: true,
      trim: true,
    },
    allowedRoles: {
      type: [Number],
      default: [RoleLevels.ADMIN],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PageAccess", pageAccessSchema);
