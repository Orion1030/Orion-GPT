require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { BlacklistModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { APP_URL } = process.env;

exports.getBlacklists = asyncErrorHandler(async (req, res, next) => {
  const { user } = req
  const { jobTitle, companyName } = req.params;
  const query = { userId: user._id };
  if (jobTitle) {
    query["jobs.jobTitle"] = jobTitle;
  }
  if (companyName) {
    query.companyName = companyName;
  }
  const blacklists = await BlacklistModel.find(query);
  return sendJsonResult(res, true, blacklists);
});
exports.addToBlacklist = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { jobTitle, companyName } = req.body;
  const blacklist = await BlacklistModel.findOne({ userId: user._id, companyName });
  if (!blacklist) {
    const newBlacklist = new BlacklistModel({
      userId: user._id,
      jobs: [{ jobTitle }],
      companyName,
    });
    await newBlacklist.save();
    return sendJsonResult(res, true, newBlacklist, "User added to blacklist successfully", 201);
  }
  if (blacklist.jobs.some(job => job.jobTitle === jobTitle)) {
    return sendJsonResult(res, false, null, "Job already exists in blacklist", 400);
  }
  blacklist.jobs.push({ jobTitle });
  await blacklist.save();
  return sendJsonResult(res, true, blacklist, "User added to blacklist successfully", 201);
});
exports.removeFromBlacklist = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { companyName, jobTitle } = req.body;
  const blacklist = await BlacklistModel.findOne({ userId: user._id, companyName });
  if (!blacklist) {
    return sendJsonResult(res, false, null, "Blacklist not found", 404);
  }
  if (jobTitle)
  {
    blacklist.jobs = blacklist.jobs.filter(job => job.jobTitle !== jobTitle);
    await blacklist.save();
  } else {
    await BlacklistModel.deleteOne({ userId: user._id, companyName });
  }
  return sendJsonResult(res, true, blacklist, "Job removed from blacklist successfully");
});
exports.clearBlacklists = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  await BlacklistModel.deleteMany({ userId: user._id });
  return sendJsonResult(res, true, null, "Blacklists cleared successfully");
});