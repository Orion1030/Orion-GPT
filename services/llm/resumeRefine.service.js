const { chatCompletions } = require("./openaiClient");
const { REFINE_MODEL, REFINE_MAX_TOKENS, REFINE_TIMEOUT_MS } = require("../../config/llm");

async function refineResumeWithFeedback({ resumeContent, feedback }) {
  if (!resumeContent || !feedback || typeof feedback !== "string") {
    throw new Error("resumeContent and feedback are required");
  }

  const systemPrompt =
    "You are a delta resume editor. Apply ONLY the user's requested changes to the resume. Do not rewrite unrelated sections. Preserve formatting and structure elsewhere. Output the full resume with only the requested edits applied, as plain text.";
  const userPrompt = `Current resume:\n\n${resumeContent}\n\nUser feedback (apply only this): ${feedback}\n\nOutput the full revised resume below.`;

  const body = await chatCompletions({
    model: REFINE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.0,
    max_completion_tokens: REFINE_MAX_TOKENS,
    timeout_ms: REFINE_TIMEOUT_MS,
  });

  return body?.choices?.[0]?.message?.content || resumeContent;
}

async function tryRefineResumeWithFeedback({ resumeContent, feedback }) {
  try {
    const content = await refineResumeWithFeedback({ resumeContent, feedback });
    return { result: { content }, error: null };
  } catch (e) {
    return { result: null, error: { message: "Refinement failed", statusCode: 502 } };
  }
}

module.exports = { refineResumeWithFeedback, tryRefineResumeWithFeedback };
