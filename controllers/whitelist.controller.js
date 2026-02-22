require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { WhitelistModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { RoleLevels } = require("../utils/constants");
const { APP_URL } = process.env;

exports.getWhitelists = asyncErrorHandler(async (req, res) => {
  const whitelists = await WhitelistModel.find({ isActive: req.user.role != RoleLevels.ADMIN }).sort({ updatedAt: -1 });
  sendJsonResult(res, 200, whitelists);
});
exports.getWhitelistItemById = asyncErrorHandler(async (req, res) => {
  const { id } = req.params
  const item = await WhitelistModel.findOne({ _id: id, isActive: req.user.role != RoleLevels.ADMIN });
  sendJsonResult(res, 200, item);
});
exports.getWhitelistItemBySiteName = asyncErrorHandler(async (req, res) => {
  const { siteName } = req.query;
  const item = await WhitelistModel.findOne({ siteName, isActive: req.user.role != RoleLevels.ADMIN });
  sendJsonResult(res, 200, item);
});
exports.createWhitelistItem = asyncErrorHandler(async (req, res) => {
  const { siteName, domain, applySelector, note } = req.body;
  if (!siteName || !domain) {
    return sendJsonResult(res, 400, null, "SiteName and domain are required");
  }
  const whitelistItem = await WhitelistModel.findOne({ siteName, domain });
  if (whitelistItem) {
    if (whitelistItem.isActive) {
      return sendJsonResult(res, 400, null, "Whitelist item with this name already exists and is active");
    }
  }
  whitelistItem.creater = req.user.username;
  whitelistItem.isActive = true;
  whitelistItem.siteName = siteName;
  whitelistItem.domain = domain;
  whitelistItem.applySelector = applySelector || whitelistItem.applySelector;
  whitelistItem.note = note || whitelistItem.note || "";
  await whitelistItem.save();
  sendJsonResult(res, 201, newItem, "Whitelist item created successfully");
});
exports.updateWhitelistById = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { applySelector, note } = req.body;
  const item = await WhitelistModel
    .findById(id);
  if (!item) {
    return sendJsonResult(res, 404, null, "Whitelist item not found");
  }
  item.applySelector = applySelector;
  item.note = note;
  await item.save();
  sendJsonResult(res, 200, item, "Whitelist item's selector updated successfully")
});
exports.addApplySelectorBySiteName = asyncErrorHandler(async (req, res) => {
  const { siteName, applySelector } = req.body;
  const item = await WhitelistModel
    .findOne({ siteName });
  if (!item) {
    return sendJsonResult(res, 404, null, "Whitelist item not found");
  }
  if (item.applySelector.includes(applySelector)) {
    return sendJsonResult(res, 400, null, "This selector already exists in the whitelist item");
  }
  item.applySelector = `${item.applySelector} {applySelector}`;
  await item.save();
  sendJsonResult(res, 200, item, "Whitelist item's selector updated successfully")
});
exports.deleteWhitelistItemById = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const item = await WhitelistModel.findByIdAndDelete(id);
  if (!item) {
    return sendJsonResult(res, 404, null, "Whitelist item not found");
  }
  sendJsonResult(res, 200, null, "Whitelist item deleted successfully");
});
exports.deleteWhitelistItemBySiteName = asyncErrorHandler(async (req, res) => {
  const { siteName } = req.query;
  const item = await WhitelistModel.findOneAndDelete({ siteName });
  if (!item) {
    return sendJsonResult(res, 404, null, "Whitelist item not found");
  }
  sendJsonResult(res, 200, null, "Whitelist item deleted successfully");
});
exports.clearWhitelists = asyncErrorHandler(async (req, res) => {
  await WhitelistModel.deleteMany({});
  sendJsonResult(res, 200, null, "Whitelist cleared successfully");
});
exports.toggleWhitelistItem = asyncErrorHandler(async (req, res) => {
  const { id } = req.query;
  const item = await WhitelistModel.findById(id);
  if (!item) {
    return sendJsonResult(res, 404, null, "Whitelist item not found");
  }
  item.isActive = !item.isActive;
  await item.save();
  sendJsonResult(res, 200, item, `Whitelist item has been ${item.isActive ? "actived" : "deactived"} successfully`);
});
