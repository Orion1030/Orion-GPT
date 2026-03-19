const { ChatMessageModel } = require('../dbModels')
const { parseJobDescriptionWithLLM, normalizeParsedJD } = require('../utils/jdParsing')

module.exports = async function jdParser(job, updateProgress) {
  const context = job.payload?.context
  if (!context) throw new Error('No context in job payload')
  updateProgress(10)

  let parsed = null
  try {
    parsed = await parseJobDescriptionWithLLM(context)
  } catch (e) {
    throw e
  }
  if (!parsed) throw new Error('Failed to parse JD')

  const normalized = normalizeParsedJD(parsed, context)
  updateProgress(50)

  // Create assistant message in session for conversational flow if sessionId provided.
  // if (job.payload && job.payload.sessionId) {
  //   const assistantContent = `Parsed Job Description:\\nTitle: ${normalized.title || ''}\\nCompany: ${normalized.company || ''}\\nSkills: ${(normalized.skills || []).join(', ')}\\n\\nRequirements:\\n${(normalized.requirements || []).map(r => '- ' + r).join('\\n')}`
  //   try {
  //     await ChatMessageModel.create({
  //       sessionId: job.payload.sessionId,
  //       role: 'assistant',
  //       content: assistantContent,
  //       structuredAssistantPayload: { type: 'job_description', parsed: normalized }
  //     })
  //   } catch (e) {
  //     // ignore message creation errors
  //   }
  // }

  updateProgress(90, { parsed: normalized })
  // IMPORTANT: do not persist JD/embedding here. The HTTP flow persists via `storeJD`
  // when the user confirms (avoids duplicate JD records + embeddings).
  return { parsed: normalized }
}

