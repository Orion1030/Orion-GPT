require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { PromptModel } = require('../dbModels')

exports.createNewPrompt = asyncErrorHandler(async (req, res, next) => {
  const { user } = req
  const { title, prompt } = req.body


  const newPrompt = new PromptModel({user: user.Id, title, prompt})
  await newPrompt.save()
  return sendJsonResult(res, true, null, "New prompt has been registered, please feel free to use it for your purpose.")
})

exports.getPrompts = asyncErrorHandler(async (req, res, next) => {
  const { user } = req
  const prompts = await PromptModel.find({user: user.Id})
  return sendJsonResult(res, true, {prompts})
})

exports.updatePrompt = asyncErrorHandler(async (req, res, next) => {
  const { newPrompt, promptId } = req.params
  const { user } = req
  const currentPrompt = await PromptModel.findOne({user: user.Id, Id: promptId})

  if (!currentPrompt) return sendJsonResult(res, false, null, 'Prompt not found', 400)
  else {
    currentPrompt.prompt = newPrompt
    await currentPrompt.save()
    return sendJsonResult(res, true, null, "Prompt has been updated")
  }
})

exports.deletePrompt = asyncErrorHandler(async (req, res, next) => {
  const { promptId } = req.query
  const { user } = req

  const currentPrompt = await PromptModel.findOne({user: user.Id, Id: promptId})
  if (!currentPrompt) return sendJsonResult(res, false, null, 'Prompt not found', 400)
  else {
    await currentPrompt.delete()
    return sendJsonResult(res, true, null, "Prompt has been deleted")
  }
})
