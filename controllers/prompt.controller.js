const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { PromptModel } = require('../dbModels')

exports.createNewPrompt = asyncErrorHandler(async (req, res, next) => {
  const { user } = req
  const { title, prompt } = req.body

  const newPrompt = new PromptModel({ user: user._id, title, prompt })
  await newPrompt.save()
  return sendJsonResult(res, true, null, "New prompt has been registered, please feel free to use it for your purpose.")
})

exports.getPrompts = asyncErrorHandler(async (req, res, next) => {
  const { user } = req
  const prompts = await PromptModel.find({ user: user._id })
  return sendJsonResult(res, true, { prompts })
})

exports.updatePrompt = asyncErrorHandler(async (req, res, next) => {
  const { promptId } = req.params
  const { newPrompt } = req.body
  const { user } = req
  const currentPrompt = await PromptModel.findOne({ user: user._id, _id: promptId })

  if (!currentPrompt) return sendJsonResult(res, false, null, 'Prompt not found', 404)
  currentPrompt.prompt = newPrompt
  await currentPrompt.save()
  return sendJsonResult(res, true, null, "Prompt has been updated")
})

exports.deletePrompt = asyncErrorHandler(async (req, res, next) => {
  const { promptId } = req.query
  const { user } = req

  const currentPrompt = await PromptModel.findOne({ user: user._id, _id: promptId })
  if (!currentPrompt) return sendJsonResult(res, false, null, 'Prompt not found', 404)
  await currentPrompt.deleteOne()
  return sendJsonResult(res, true, null, "Prompt has been deleted")
})
