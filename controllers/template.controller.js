require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { TemplateModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { getBuiltInSeedTemplates } = require("../utils/builtInTemplates");

exports.getTemplates = asyncErrorHandler(async (req, res) => {
  const templates = await TemplateModel.find({}).sort({ isBuiltIn: -1, updatedAt: -1 });
  sendJsonResult(res, 200, templates);
});
exports.getTemplate = asyncErrorHandler(async (req, res) => {
  const template = await TemplateModel.findById(req.params.id);
  sendJsonResult(res, 200, template);
});
exports.createTemplate = asyncErrorHandler(async (req, res) => {
  const { name, data, note, description, layoutMode } = req.body;
  if (!name || !data) {
    return sendJsonResult(res, 400, null, "Name and data are required");
  }
  if (await TemplateModel.exists({ name })) {
    return sendJsonResult(res, 400, null, "Template with this name already exists");
  }
  const newTemplate = new TemplateModel({ name, data, note, description, layoutMode });
  await newTemplate.save();
  sendJsonResult(res, 201, null, "Template created successfully");
});
exports.updateTemplate = asyncErrorHandler(async (req, res) => {
  const { name, data, note, description, layoutMode } = req.body;
  if (!name || !data) {
    return sendJsonResult(res, 400, null, "Name and data are required");
  }
  const template = await TemplateModel.findById(req.params.id);
  if (!template) {
    return sendJsonResult(res, 404, null, "Template not found");
  }
  template.name = name;
  template.data = data;
  template.note = note ?? template.note;
  template.description = description ?? template.description;
  if (layoutMode) template.layoutMode = layoutMode;
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

exports.seedTemplates = asyncErrorHandler(async (req, res) => {
  const seeds = getBuiltInSeedTemplates();
  const existing = await TemplateModel.find({ isBuiltIn: true }).select('name');
  const existingNames = new Set(existing.map(t => t.name));
  const toInsert = seeds.filter(s => !existingNames.has(s.name));
  if (toInsert.length > 0) {
    await TemplateModel.insertMany(toInsert);
  }
  const all = await TemplateModel.find({}).sort({ isBuiltIn: -1, updatedAt: -1 });
  sendJsonResult(res, 200, all, `Seeded ${toInsert.length} built-in templates`);
});

exports.migrateBuiltInTemplates = asyncErrorHandler(async (req, res) => {
  const { ResumeModel } = require("../dbModels");
  const builtInTemplates = await TemplateModel.find({ isBuiltIn: true });
  const nameToId = {};
  for (const t of builtInTemplates) {
    nameToId[t.name.toLowerCase()] = t._id;
  }
  const mapping = {
    'builtin-classic': nameToId['classic'],
    'builtin-modern': nameToId['modern'],
    'builtin-minimal': nameToId['minimal'],
    'builtin-compact': nameToId['compact'],
    'builtin-hybrid': nameToId['hybrid'],
  };
  let migrated = 0;
  const resumes = await ResumeModel.find({
    builtInTemplateId: { $ne: null, $exists: true }
  });
  for (const resume of resumes) {
    const newTemplateId = mapping[resume.builtInTemplateId];
    if (newTemplateId) {
      resume.templateId = newTemplateId;
      resume.builtInTemplateId = null;
      await resume.save();
      migrated++;
    }
  }
  sendJsonResult(res, 200, { migrated }, `Migrated ${migrated} resumes`);
});