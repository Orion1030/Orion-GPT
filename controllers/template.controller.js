require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { TemplateModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");

exports.getTemplates = asyncErrorHandler(async (req, res) => {
  const templates = await TemplateModel.find({}).sort({ updatedAt: -1 });
  sendJsonResult(res, 200, templates);
});
exports.getTemplate = asyncErrorHandler(async (req, res) => {
  const template = await TemplateModel.findById(req.params.id);
  sendJsonResult(res, 200, template);
});
exports.createTemplate = asyncErrorHandler(async (req, res) => {
  const { name, data, note } = req.body;
  if (!name || !data) {
    return sendJsonResult(res, 400, null, "Name and data are required");
  }
  if (await TemplateModel.exists({ name })) {
    return sendJsonResult(res, 400, null, "Template with this name already exists");
  }
  const newTemplate = new TemplateModel({ name, data, note });
  await newTemplate.save();
  sendJsonResult(res, 201, null, "Template created successfully");
});
exports.updateTemplate = asyncErrorHandler(async (req, res) => {
  const { name, data, note } = req.body;
  if (!name || !data) {
    return sendJsonResult(res, 400, null, "Name and data are required");
  }
  const template = await TemplateModel.findById(req.params.id);
  if (!template) {
    return sendJsonResult(res, 404, null, "Template not found");
  }
  template.name = name;
  template.data = data;
  template.note = note || template.note;
  await template.save();
  sendJsonResult(res, 200, template, "Template updated successfully");
});
exports.deleteTemplate = asyncErrorHandler(async (req, res) => {
  await TemplateModel.findByIdAndDelete(req.params.id);
  sendJsonResult(res, 200, null, "Template deleted successfully");
});
exports.clearTemplates = asyncErrorHandler(async (req, res) => {
  await TemplateModel.deleteMany({});
  sendJsonResult(res, 200, null, "Templates cleared successfully");
});