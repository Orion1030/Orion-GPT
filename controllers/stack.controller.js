const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { StackModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");

function normalizeSkills(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((skill) => String(skill || "").trim())
    .filter(Boolean)
    .map((skill) => skill.toUpperCase());
}

function normalizeTitle(value) {
  return String(value || "").trim();
}

function toPublicStack(raw) {
  if (!raw) return null;
  const stack = typeof raw.toObject === "function" ? raw.toObject() : raw;
  const secondarySkills = Array.isArray(stack.secondarySkills)
    ? stack.secondarySkills
    : Array.isArray(stack.SecondarySkills)
      ? stack.SecondarySkills
      : [];

  return {
    _id: stack._id,
    id: stack._id ? String(stack._id) : "",
    title: stack.title || "",
    primarySkills: Array.isArray(stack.primarySkills) ? stack.primarySkills : [],
    secondarySkills,
    note: stack.note || "",
    createdAt: stack.createdAt || null,
    updatedAt: stack.updatedAt || null,
  };
}

exports.getStackById = asyncErrorHandler(async (req, res, next) => {
  const { stackId } = req.params;
  const stack = await StackModel.findOne({ _id: stackId }).lean();
  if (!stack) {
    return sendJsonResult(res, false, null, "Stack not found", 404);
  }
  return sendJsonResult(res, true, toPublicStack(stack));
});

exports.getStacks = asyncErrorHandler(async (req, res, next) => {
  const stacks = await StackModel.find().sort({ title: 1, createdAt: 1 }).lean();
  return sendJsonResult(res, true, stacks.map(toPublicStack));
});

exports.createStack = asyncErrorHandler(async (req, res, next) => {
  const { title, primarySkills, secondarySkills, note } = req.body;
  const normalizedTitle = normalizeTitle(title);
  const normalizedPrimary = normalizeSkills(primarySkills);
  const normalizedSecondary = normalizeSkills(secondarySkills);

  if (!normalizedTitle) {
    return sendJsonResult(res, false, null, "Title is required", 400);
  }

  const finalPrimarySkills = normalizedPrimary.length ? normalizedPrimary : [normalizedTitle.toUpperCase()];
  if (finalPrimarySkills.length === 0) {
    return sendJsonResult(res, false, null, "Primary skills cannot be empty", 400);
  }

  const existingStack = await StackModel.findOne({ title: normalizedTitle });
  if (existingStack) {
    return sendJsonResult(res, false, null, "Stack with this name already exists", 400);
  }
  const newStack = new StackModel({
    title: normalizedTitle,
    primarySkills: finalPrimarySkills,
    SecondarySkills: normalizedSecondary,
    note: String(note || "").trim(),
  });
  await newStack.save();
  return sendJsonResult(res, true, toPublicStack(newStack), "Stack created successfully", 201);
});
exports.updateStack = asyncErrorHandler(async (req, res, next) => {
  const { stackId } = req.params;
  const { title, primarySkills, secondarySkills, note } = req.body;
  const normalizedTitle = normalizeTitle(title);
  const normalizedPrimary = normalizeSkills(primarySkills);
  const normalizedSecondary = normalizeSkills(secondarySkills);

  if (!normalizedTitle) {
    return sendJsonResult(res, false, null, "Title is required", 400);
  }

  const finalPrimarySkills = normalizedPrimary.length ? normalizedPrimary : [normalizedTitle.toUpperCase()];
  if (finalPrimarySkills.length === 0) {
    return sendJsonResult(res, false, null, "Primary skills cannot be empty", 400);
  }

  const duplicateTitle = await StackModel.findOne({
    _id: { $ne: stackId },
    title: normalizedTitle,
  }).lean();
  if (duplicateTitle) {
    return sendJsonResult(res, false, null, "Stack with this name already exists", 400);
  }

  const updatedStack = await StackModel.findByIdAndUpdate(
    stackId,
    {
      title: normalizedTitle,
      primarySkills: finalPrimarySkills,
      SecondarySkills: normalizedSecondary,
      note: String(note || "").trim(),
    },
    { returnDocument: "after" },
  );
  if (!updatedStack) {
    return sendJsonResult(res, false, null, "Stack not found", 404);
  }
  return sendJsonResult(res, true, toPublicStack(updatedStack));
});
exports.deleteStack = asyncErrorHandler(async (req, res, next) => {
  const { stackId } = req.params;
  const deletedStack = await StackModel.findByIdAndDelete(stackId);
  if (!deletedStack) {
    return sendJsonResult(res, false, null, "Stack not found", 404);
  }
  return sendJsonResult(res, true, null, "Stack deleted successfully");
});
exports.clearStacks = asyncErrorHandler(async (req, res, next) => {
  await StackModel.deleteMany();
  return sendJsonResult(res, true, null, "All stacks cleared successfully");
});
exports.getStackBytitle = asyncErrorHandler(async (req, res, next) => {
  const { title } = req.query;
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) {
    return sendJsonResult(res, false, null, "Title is required", 400);
  }
  const stack = await StackModel.findOne({ title: normalizedTitle }).lean();
  if (!stack) {
    return sendJsonResult(res, false, null, "Stack not found", 404);
  }
  return sendJsonResult(res, true, toPublicStack(stack));
});
exports.getStacksByPrimarySkills = asyncErrorHandler(async (req, res, next) => {
  const sourceSkills = Array.isArray(req.body?.primarySkills)
    ? req.body.primarySkills
    : String(req.query?.primarySkills || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  const skillsArray = normalizeSkills(sourceSkills);
  if (skillsArray.length === 0) {
    return sendJsonResult(res, false, null, "Primary skills cannot be empty", 400);
  }
  const stacks = await StackModel.find({ primarySkills: { $in: skillsArray } }).lean();
  return sendJsonResult(res, true, stacks.map(toPublicStack));
});
