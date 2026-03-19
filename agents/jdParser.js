const { parseJobDescriptionWithLLM, normalizeParsedJD } = require('../utils/jdParsing')
const { persistParsedJobDescription } = require('../services/jdImport.service')

module.exports = async function jdParser(job, updateProgress) {
  const { context } = job.payload || {}
  if (!context) throw new Error('No context in job payload')

  updateProgress(10)
  const parsed = await parseJobDescriptionWithLLM(context)
  if (!parsed) throw new Error('Failed to parse JD')

  const normalized = normalizeParsedJD(parsed)
  updateProgress(50)

  const { jdId } = await persistParsedJobDescription({
    userId: job.userId,
    normalized,
    context,
  })
  updateProgress(90, { jdId, parsed: normalized })

  return { jdId, parsed: normalized }
}
