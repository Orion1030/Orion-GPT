const { parseResumeTextWithLLM } = require("../services/llm/resumeParse.service");

async function tryParseResumeTextWithLLM(text) {
  try {
    const parsed = await parseResumeTextWithLLM(text);
    if (!parsed) {
      return { result: null, error: { message: "Failed to parse resume text", statusCode: 502 } };
    }
    return { result: { parsed }, error: null };
  } catch (e) {
    return { result: null, error: { message: "LLM request failed", statusCode: 502 } };
  }
}

module.exports = { parseResumeTextWithLLM, tryParseResumeTextWithLLM };

