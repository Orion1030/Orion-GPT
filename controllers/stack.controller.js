const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { StackModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");

exports.getStackById = asyncErrorHandler(async (req, res, next) => {
  const { stackId } = req.params;
  const stack = await StackModel.findOne({ _id: stackId });
  if (!stack) {
    return sendJsonResult(res, false, null, "Stack not found", 404);
  }
  return sendJsonResult(res, true, stack);
});

exports.getStacks = asyncErrorHandler(async (req, res, next) => {
  const stacks = await StackModel.find();
  return sendJsonResult(res, true, stacks);
});

exports.createStack = asyncErrorHandler(async (req, res, next) => {
  const { title, primarySkills, secondarySkills, note } = req.body;

  let upperCasePrimarySkills = primarySkills.map(skill => skill.toUpperCase())
  upperCasePrimarySkills = upperCasePrimarySkills.filter(skill => skill.trim() !== "");
  if (upperCasePrimarySkills.length === 0) {
    return sendJsonResult(res, false, null, "Primary skills cannot be empty", 400);
  }
  let upperCaseSecondarySkills = secondarySkills.map(skill => skill.toUpperCase());
  upperCaseSecondarySkills = upperCaseSecondarySkills.filter(skill => skill.trim() !== "");

  const existingStack = await StackModel.findOne({ title });
  if (existingStack) {
    return sendJsonResult(res, false, null, "Stack with this name already exists", 400);
  }
  const newStack = new StackModel({ title, upperCasePrimarySkills, upperCaseSecondarySkills, note });
  await newStack.save();
  return sendJsonResult(res, true, newStack, "Stack created successfully", 201);
});
exports.updateStack = asyncErrorHandler(async (req, res, next) => {
  const { stackId } = req.params;
  const { title, primarySkills, secondarySkills, note } = req.body;

  let upperCasePrimarySkills = primarySkills.map(skill => skill.toUpperCase())
  upperCasePrimarySkills = upperCasePrimarySkills.filter(skill => skill.trim() !== "");
  if (upperCasePrimarySkills.length === 0) {
    return sendJsonResult(res, false, null, "Primary skills cannot be empty", 400);
  }
  let upperCaseSecondarySkills = secondarySkills.map(skill => skill.toUpperCase());
  upperCaseSecondarySkills = upperCaseSecondarySkills.filter(skill => skill.trim() !== "");

  const updatedStack = await StackModel.findByIdAndUpdate(
    stackId,
    { title, upperCasePrimarySkills, upperCaseSecondarySkills, note },
    { returnDocument: "after" },
  );
  if (!updatedStack) {
    return sendJsonResult(res, false, null, "Stack not found", 404);
  }
  return sendJsonResult(res, true, updatedStack);
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
  const stack = await StackModel.findOne({ title });
  if (!stack) {
    return sendJsonResult(res, false, null, "Stack not found", 404);
  }
  return sendJsonResult(res, true, stack);
});
exports.getStacksByPrimarySkills = asyncErrorHandler(async (req, res, next) => {
  const { primarySkills } = req.body;
  const skillsArray = primarySkills.map(skill => skill.toUpperCase());
  if (skillsArray.length === 0) {
    return sendJsonResult(res, false, null, "Primary skills cannot be empty", 400);
  }
  const stacks = await StackModel.find({
    primarySkills: { $in: skillsArray.map(skill => skill.toUpperCase()) },
  });
  return sendJsonResult(res, true, stacks);
});
