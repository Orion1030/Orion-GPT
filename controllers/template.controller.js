const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { TemplateModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { getBuiltInSeedTemplates } = require("../utils/builtInTemplates");
const { isAdminUser } = require("../utils/access");
const { validateTemplateWrite } = require("../utils/templatePolicy");
const {
  MAX_PROMPT_LENGTH,
  MAX_TEMPLATE_CONTEXT_LENGTH,
  tryGenerateTemplateWithAi,
} = require("../services/llm/templateGenerate.service");

function toTargetUserId(req) {
  const fromQuery = req.query?.userId;
  if (typeof fromQuery === "string" && fromQuery.trim()) return fromQuery.trim();
  const fromBody = req.body?.userId;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  return null;
}

function buildTemplateReadFilter(req) {
  const templateType = normalizeTemplateType(req.query?.templateType, null);
  const typeFilter = templateType ? buildTemplateTypeFilter(templateType) : null;
  if (isAdminUser(req.user)) {
    const targetUserId = toTargetUserId(req);
    if (targetUserId) {
      const accessFilter = { $or: [{ isBuiltIn: true }, { userId: targetUserId }] };
      return typeFilter ? { $and: [typeFilter, accessFilter] } : accessFilter;
    }
    return typeFilter || {};
  }

  const accessFilter = { $or: [{ isBuiltIn: true }, { userId: req.user._id }] };
  return typeFilter ? { $and: [typeFilter, accessFilter] } : accessFilter;
}

function normalizeTemplateType(value, fallback = "resume") {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "cover_letter") return "cover_letter";
  if (text === "resume") return "resume";
  return fallback;
}

function buildTemplateTypeFilter(templateType) {
  if (templateType === "resume") {
    return { $or: [{ templateType: "resume" }, { templateType: { $exists: false } }] };
  }
  return { templateType };
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

exports.generateTemplateWithAi = asyncErrorHandler(async (req, res) => {
  if (!isAdminUser(req.user)) {
    return sendJsonResult(res, false, null, "Only Admin can generate EJS templates", 403, {
      showNotification: true,
    });
  }

  const {
    prompt,
    currentTemplateHtml,
    currentName,
    currentDescription,
    layoutMode,
    templateType,
  } = req.body || {};
  const cleanPrompt = typeof prompt === "string" ? prompt.trim() : "";
  const cleanTemplate = typeof currentTemplateHtml === "string" ? currentTemplateHtml.trim() : "";

  if (!cleanPrompt) {
    return sendJsonResult(res, false, null, "Prompt is required", 400);
  }
  if (!cleanTemplate) {
    return sendJsonResult(res, false, null, "Current template HTML is required", 400);
  }
  if (cleanPrompt.length > MAX_PROMPT_LENGTH) {
    return sendJsonResult(res, false, null, `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer`, 413);
  }
  if (cleanTemplate.length > MAX_TEMPLATE_CONTEXT_LENGTH) {
    return sendJsonResult(res, false, null, `Current template HTML must be ${MAX_TEMPLATE_CONTEXT_LENGTH} characters or fewer`, 413);
  }

  const { result, error } = await tryGenerateTemplateWithAi({
    prompt: cleanPrompt,
    currentTemplateHtml: cleanTemplate,
    currentName,
    currentDescription,
    layoutMode,
    templateType: normalizeTemplateType(templateType),
    targetUserId: req.user?._id,
  });

  if (error) {
    return sendJsonResult(res, false, null, error.message, error.statusCode || 502, {
      showNotification: true,
    });
  }

  sendJsonResult(res, true, result.template);
});

exports.createTemplate = asyncErrorHandler(async (req, res) => {
  const { name, data, note, description, layoutMode, templateEngine } = req.body;
  const templateType = normalizeTemplateType(req.body?.templateType);
  if (!name || !data) {
    return sendJsonResult(res, false, null, "Name and data are required", 400);
  }

  const writeValidation = validateTemplateWrite({ data }, req.user);
  if (!writeValidation.ok) {
    return sendJsonResult(res, false, null, writeValidation.message, writeValidation.statusCode, {
      showNotification: true,
    });
  }

  const userIsAdmin = isAdminUser(req.user);
  const targetUserId = toTargetUserId(req);
  const ownerId = userIsAdmin && targetUserId ? targetUserId : req.user._id;

  const duplicateCreateFilter = {
    name,
    isBuiltIn: false,
    userId: ownerId,
    ...(templateType === "resume"
      ? { $or: [{ templateType: "resume" }, { templateType: { $exists: false } }] }
      : { templateType }),
  };
  if (await TemplateModel.exists(duplicateCreateFilter)) {
    return sendJsonResult(res, false, null, "Template with this name already exists", 400);
  }

  const newTemplate = new TemplateModel({
    name,
    templateType,
    data,
    note,
    description,
    layoutMode,
    templateEngine: templateEngine || "ejs",
    migrationStatus: "ready",
    isBuiltIn: false,
    userId: ownerId,
  });
  await newTemplate.save();
  sendJsonResult(res, true, newTemplate, "Template created successfully", 201);
});

exports.updateTemplate = asyncErrorHandler(async (req, res) => {
  const { name, data, note, description, layoutMode, templateEngine } = req.body;
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

  const writeValidation = validateTemplateWrite({ data }, req.user);
  if (!writeValidation.ok) {
    return sendJsonResult(res, false, null, writeValidation.message, writeValidation.statusCode, {
      showNotification: true,
    });
  }

  const templateType = normalizeTemplateType(req.body?.templateType, template.templateType || "resume");
  const duplicateFilter = template.isBuiltIn
    ? {
        _id: { $ne: template._id },
        name,
        isBuiltIn: true,
        ...(templateType === "resume"
          ? { $or: [{ templateType: "resume" }, { templateType: { $exists: false } }] }
          : { templateType }),
      }
    : {
        _id: { $ne: template._id },
        name,
        isBuiltIn: false,
        userId: template.userId || null,
        ...(templateType === "resume"
          ? { $or: [{ templateType: "resume" }, { templateType: { $exists: false } }] }
          : { templateType }),
      };
  if (await TemplateModel.exists(duplicateFilter)) {
    return sendJsonResult(res, false, null, "Template with this name already exists", 400);
  }

  template.name = name;
  template.templateType = templateType;
  template.data = data;
  template.note = note ?? template.note;
  template.description = description ?? template.description;
  if (layoutMode) template.layoutMode = layoutMode;
  template.templateEngine = templateEngine || "ejs";
  template.migrationStatus = "ready";
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
  let inserted = 0;
  let updated = 0;

  for (const seed of seeds) {
    const seedTemplateType = seed.templateType || "resume";
    const seedFilter = seedTemplateType === "resume"
      ? {
          name: seed.name,
          isBuiltIn: true,
          $or: [{ templateType: "resume" }, { templateType: { $exists: false } }],
        }
      : { name: seed.name, templateType: seedTemplateType, isBuiltIn: true };
    const result = await TemplateModel.updateOne(
      seedFilter,
      {
        $set: {
          ...seed,
          isBuiltIn: true,
          userId: null,
          templateEngine: "ejs",
          migrationStatus: "ready",
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) inserted += result.upsertedCount;
    else updated += result.modifiedCount > 0 ? 1 : 0;
  }

  const all = await TemplateModel.find(buildTemplateReadFilter(req)).sort({ isBuiltIn: -1, updatedAt: -1 });
  sendJsonResult(res, true, all, `Upserted built-in templates: inserted ${inserted}, updated ${updated}`);
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
