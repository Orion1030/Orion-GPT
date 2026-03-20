require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { WhitelistModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { RoleLevels } = require("../utils/constants");
const { APP_URL } = process.env;

exports.getWhitelists = asyncErrorHandler(async (req, res) => {
  const query = req.user.role === RoleLevels.ADMIN ? {} : { isActive: true };
  const whitelists = await WhitelistModel.find(query).sort({ updatedAt: -1 });
  sendJsonResult(res, true, whitelists);
});
exports.getWhitelistItemById = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const item = await WhitelistModel.findById(id);
  if (!item) return sendJsonResult(res, false, null, "Not found", 404);
  sendJsonResult(res, true, item);
});
exports.getWhitelistItemBySiteName = asyncErrorHandler(async (req, res) => {
  const { siteName } = req.query;
  const item = await WhitelistModel.findOne({ siteName, isActive: true });
  sendJsonResult(res, true, item || null);
});
exports.createWhitelistItem = asyncErrorHandler(async (req, res) => {
  const { siteName, domain, applySelector, note } = req.body;
  if (!siteName || !domain) {
    return sendJsonResult(res, false, null, "siteName and domain are required", 400);
  }
  const existing = await WhitelistModel.findOne({ siteName, domain });
  if (existing) {
    if (existing.isActive) {
      return sendJsonResult(res, false, null, "Whitelist item with this name already exists and is active", 400);
    }
    existing.isActive = true;
    existing.applySelector = applySelector || existing.applySelector;
    existing.note = note || existing.note || "";
    await existing.save();
    return sendJsonResult(res, true, existing, "Whitelist item re-activated", 201);
  }
  const newItem = new WhitelistModel({
    creater: req.user.name,
    siteName,
    domain,
    applySelector: applySelector || 'a[href="/apply"]',
    note: note || "",
    isActive: true,
  });
  await newItem.save();
  sendJsonResult(res, true, newItem, "Whitelist item created successfully", 201);
});
exports.updateWhitelistById = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { applySelector, note, isActive } = req.body;
  const item = await WhitelistModel.findById(id);
  if (!item) {
    return sendJsonResult(res, false, null, "Whitelist item not found", 404);
  }
  if (applySelector !== undefined) item.applySelector = applySelector;
  if (note !== undefined) item.note = note;
  if (isActive !== undefined) item.isActive = isActive;
  await item.save();
  sendJsonResult(res, true, item, "Whitelist item updated successfully");
});
exports.addApplySelectorBySiteName = asyncErrorHandler(async (req, res) => {
  const { siteName, applySelector } = req.body;
  const item = await WhitelistModel.findOne({ siteName });
  if (!item) {
    return sendJsonResult(res, false, null, "Whitelist item not found", 404);
  }
  if (item.applySelector.includes(applySelector)) {
    return sendJsonResult(res, false, null, "This selector already exists in the whitelist item", 400);
  }
  item.applySelector = `${item.applySelector} ${applySelector}`;
  await item.save();
  sendJsonResult(res, true, item, "Whitelist item's selector updated successfully");
});
exports.deleteWhitelistItemById = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const item = await WhitelistModel.findByIdAndDelete(id);
  if (!item) {
    return sendJsonResult(res, false, null, "Whitelist item not found", 404);
  }
  sendJsonResult(res, true, null, "Whitelist item deleted successfully");
});
exports.deleteWhitelistItemBySiteName = asyncErrorHandler(async (req, res) => {
  const { siteName } = req.query;
  const item = await WhitelistModel.findOneAndDelete({ siteName });
  if (!item) {
    return sendJsonResult(res, false, null, "Whitelist item not found", 404);
  }
  sendJsonResult(res, true, null, "Whitelist item deleted successfully");
});
exports.clearWhitelists = asyncErrorHandler(async (req, res) => {
  await WhitelistModel.deleteMany({});
  sendJsonResult(res, true, null, "Whitelist cleared successfully");
});
exports.toggleWhitelistItem = asyncErrorHandler(async (req, res) => {
  const { id } = req.query;
  const item = await WhitelistModel.findById(id);
  if (!item) {
    return sendJsonResult(res, false, null, "Whitelist item not found", 404);
  }
  item.isActive = !item.isActive;
  await item.save();
  sendJsonResult(res, true, item, `Whitelist item has been ${item.isActive ? "activated" : "deactivated"} successfully`);
});
