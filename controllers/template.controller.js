const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { TemplateModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { getBuiltInSeedTemplates } = require("../utils/builtInTemplates");
const { isAdminUser } = require("../utils/access");

function toTargetUserId(req) {
  const fromQuery = req.query?.userId;
  if (typeof fromQuery === "string" && fromQuery.trim()) return fromQuery.trim();
  const fromBody = req.body?.userId;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  return null;
}

function buildTemplateReadFilter(req) {
  if (isAdminUser(req.user)) {
    const targetUserId = toTargetUserId(req);
    if (targetUserId) {
      return { $or: [{ isBuiltIn: true }, { userId: targetUserId }] };
    }
    return {};
  }

  return {
    $or: [{ isBuiltIn: true }, { userId: req.user._id }],
  };
}

function isOwnerTemplate(template, userId) {
  if (!template?.userId) return false;
  return String(template.userId) === String(userId);
}

function canEditTemplate(template, user) {
  if (!template || !user) return false;
  if (isAdminUser(user)) return true;
  if (template.isBuiltIn) return false;
  return isOwnerTemplate(template, user._id);
}

exports.getTemplates = asyncErrorHandler(async (req, res) => {
  const templates = await TemplateModel.find(buildTemplateReadFilter(req)).sort({ isBuiltIn: -1, updatedAt: -1 });
  sendJsonResult(res, true, templates);
});

exports.getTemplate = asyncErrorHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...buildTemplateReadFilter(req) };
  const template = await TemplateModel.findOne(filter);
  if (!template) {
    return sendJsonResult(res, false, null, "Template not found", 404);
  }
  sendJsonResult(res, true, template);
});

exports.createTemplate = asyncErrorHandler(async (req, res) => {
  const { name, data, note, description, layoutMode } = req.body;
  if (!name || !data) {
    return sendJsonResult(res, false, null, "Name and data are required", 400);
  }

  const userIsAdmin = isAdminUser(req.user);
  const targetUserId = toTargetUserId(req);
  const ownerId = userIsAdmin && targetUserId ? targetUserId : req.user._id;

  if (await TemplateModel.exists({ name, isBuiltIn: false, userId: ownerId })) {
    return sendJsonResult(res, false, null, "Template with this name already exists", 400);
  }

  const newTemplate = new TemplateModel({
    name,
    data,
    note,
    description,
    layoutMode,
    isBuiltIn: false,
    userId: ownerId,
  });
  await newTemplate.save();
  sendJsonResult(res, true, newTemplate, "Template created successfully", 201);
});

exports.updateTemplate = asyncErrorHandler(async (req, res) => {
  const { name, data, note, description, layoutMode } = req.body;
  if (!name || !data) {
    return sendJsonResult(res, false, null, "Name and data are required", 400);
  }
  const template = await TemplateModel.findById(req.params.id);
  if (!template) {
    return sendJsonResult(res, false, null, "Template not found", 404);
  }

  if (!canEditTemplate(template, req.user)) {
    if (template.isBuiltIn) {
      return sendJsonResult(res, false, null, "Only Admin can edit built-in templates", 403, {
        showNotification: true,
      });
    }
    return sendJsonResult(res, false, null, "Insufficient permission", 403, {
      showNotification: true,
    });
  }

  const duplicateFilter = template.isBuiltIn
    ? { _id: { $ne: template._id }, name, isBuiltIn: true }
    : { _id: { $ne: template._id }, name, isBuiltIn: false, userId: template.userId || null };
  if (await TemplateModel.exists(duplicateFilter)) {
    return sendJsonResult(res, false, null, "Template with this name already exists", 400);
  }

  template.name = name;
  template.data = data;
  template.note = note ?? template.note;
  template.description = description ?? template.description;
  if (layoutMode) template.layoutMode = layoutMode;
  await template.save();
  sendJsonResult(res, true, template, "Template updated successfully");
});

exports.deleteTemplate = asyncErrorHandler(async (req, res) => {
  const template = await TemplateModel.findById(req.params.id);
  if (!template) {
    return sendJsonResult(res, false, null, "Template not found", 404);
  }

  if (!canEditTemplate(template, req.user)) {
    if (template.isBuiltIn) {
      return sendJsonResult(res, false, null, "Only Admin can delete built-in templates", 403, {
        showNotification: true,
      });
    }
    return sendJsonResult(res, false, null, "Insufficient permission", 403, {
      showNotification: true,
    });
  }

  await template.deleteOne();
  sendJsonResult(res, true, null, "Template deleted successfully");
});

exports.clearTemplates = asyncErrorHandler(async (req, res) => {
  if (!isAdminUser(req.user)) {
    await TemplateModel.deleteMany({ userId: req.user._id, isBuiltIn: false });
    return sendJsonResult(res, true, null, "Templates cleared successfully");
  }

  const targetUserId = toTargetUserId(req);
  if (targetUserId) {
    await TemplateModel.deleteMany({ userId: targetUserId, isBuiltIn: false });
    return sendJsonResult(res, true, null, "Templates cleared successfully");
  }

  await TemplateModel.deleteMany({ isBuiltIn: false });
  sendJsonResult(res, true, null, "Templates cleared successfully");
});

exports.seedTemplates = asyncErrorHandler(async (req, res) => {
  const seeds = getBuiltInSeedTemplates();
  const existing = await TemplateModel.find({ isBuiltIn: true }).select('name');
  const existingNames = new Set(existing.map(t => t.name));
  const toInsert = seeds.filter(s => !existingNames.has(s.name));
  if (toInsert.length > 0) {
    await TemplateModel.insertMany(toInsert);
  }
  const all = await TemplateModel.find(buildTemplateReadFilter(req)).sort({ isBuiltIn: -1, updatedAt: -1 });
  sendJsonResult(res, true, all, `Seeded ${toInsert.length} built-in templates`);
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
    builtInTemplateId: { $ne: null, $exists: true },
    isDeleted: { $ne: true },
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
  sendJsonResult(res, true, { migrated }, `Migrated ${migrated} resumes`);
});
