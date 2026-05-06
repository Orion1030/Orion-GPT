const { chatCompletions } = require("./openaiClient");
const { PARSE_MODEL, PARSE_MAX_TOKENS, PARSE_TIMEOUT_MS } = require("../../config/llm");
const { resumeSchema } = require("./schemas/resumeSchemas");

// Basic JSON repair for common LLM issues
function repairJson(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') return jsonString;

  let repaired = jsonString.trim().replace(/```json|```/gi, "").trim();

  // Remove obvious non-JSON prefixes/suffixes.
  const firstBrace = repaired.indexOf("{");
  const lastBrace = repaired.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    repaired = repaired.slice(firstBrace, lastBrace + 1);
  } else if (firstBrace >= 0) {
    repaired = repaired.slice(firstBrace);
  }

  // Count only unescaped quotes for string balancing.
  let unescapedQuoteCount = 0;
  for (let i = 0; i < repaired.length; i++) {
    if (repaired[i] !== '"') continue;
    let backslashes = 0;
    let j = i - 1;
    while (j >= 0 && repaired[j] === "\\") {
      backslashes += 1;
      j -= 1;
    }
    if (backslashes % 2 === 0) unescapedQuoteCount += 1;
  }

  if (unescapedQuoteCount % 2 !== 0) {
    repaired += '"';
  }

  // Trim a dangling comma at EOF if present before balancing structures.
  repaired = repaired.replace(/,\s*$/, "");

  // Balance braces/brackets while ignoring content in strings.
  let inString = false;
  let escapeNext = false;
  let openBraces = 0;
  let openBrackets = 0;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") openBraces += 1;
    else if (ch === "}" && openBraces > 0) openBraces -= 1;
    else if (ch === "[") openBrackets += 1;
    else if (ch === "]" && openBrackets > 0) openBrackets -= 1;
  }

  if (inString) repaired += '"';
  while (openBrackets > 0) {
    repaired += "]";
    openBrackets -= 1;
  }
  while (openBraces > 0) {
    repaired += "}";
    openBraces -= 1;
  }

  // If output was truncated right after a key/value separator, remove trailing partial token.
  repaired = repaired.replace(/[,:]\s*$/, "");

  // Remove trailing commas before closing braces/brackets
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  return repaired;
}

function tryParseJsonCandidate(candidate, label) {
  if (!candidate || typeof candidate !== "string") return null;

  try {
    return JSON.parse(candidate);
  } catch (err1) {
    console.warn(`[Parse] ${label} direct parse failed:`, err1.message);
  }

  const trimmed = candidate.trim();
  const extracted = (() => {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
    return trimmed;
  })();

  if (extracted !== trimmed) {
    try {
      return JSON.parse(extracted);
    } catch (err2) {
      console.warn(`[Parse] ${label} extracted parse failed:`, err2.message);
    }
  }

  const repaired = repairJson(extracted);
  if (repaired && repaired !== extracted) {
    try {
      return JSON.parse(repaired);
    } catch (err3) {
      console.warn(`[Parse] ${label} repaired parse failed:`, err3.message);
    }
  }

  return null;
}

async function parseResumeTextWithLLM(text) {
  const systemPrompt =
    "You are a resume parsing assistant. Extract structured resume data as JSON with keys: name, summary, experiences, skills, education. The experiences array should contain objects with title, companyName, companyLocation, bullets (array), startDate, endDate. The skills array should contain objects with title and items (array). The education array should contain objects with degreeLevel (BS/MS when possible), universityName, major, startDate, endDate. Normalize each startDate/endDate to one of: YYYY-MM-DD when exact day is known, YYYY-MM when only month and year are known, YYYY when only year is known, or Present for current roles/education. Never combine date ranges into a single field, and never leave dates embedded inside title, companyName, or universityName. Reply ONLY with valid JSON.";

  const userPrompt = `Parse the following resume text and return the JSON described above. Text:\n\n${text}`;

  const functions = [
    {
      name: "parse_resume",
      description: "Return a strict JSON object representing extracted resume sections.",
      parameters: resumeSchema,
    },
  ];

  const body = await chatCompletions({
    model: PARSE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.0,
    max_completion_tokens: PARSE_MAX_TOKENS,
    timeout_ms: PARSE_TIMEOUT_MS,
    functions,
    function_call: { name: "parse_resume" },
  });

  const msg = body?.choices?.[0]?.message;
  let rawJson = null;

  // Try function_call arguments first (preferred method)
  if (msg?.function_call?.arguments) {
    rawJson = tryParseJsonCandidate(msg.function_call.arguments, "function_call.arguments");
  }

  // Fallback to content parsing
  if (!rawJson && msg?.content) {
    rawJson = tryParseJsonCandidate(msg.content, "content");
  }

  if (!rawJson) {
    console.error('[Parse] No valid JSON found in LLM response');
    return null;
  }

  return rawJson;
}

module.exports = { parseResumeTextWithLLM };
