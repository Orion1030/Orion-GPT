const { chatCompletions } = require("./openaiClient");
const {
  GENERATE_MODEL,
  GENERATE_MAX_TOKENS,
  GENERATE_MAX_TOKEN_CEILING,
  GENERATE_REASONING_MODEL,
  GENERATE_TIMEOUT_MS,
  GENERATE_MIN_BULLETS_SENIOR,
  GENERATE_MIN_BULLETS_MID,
  GENERATE_MIN_BULLETS_JUNIOR,
} = require("../../config/llm");
const { resumeSchema } = require("./schemas/resumeSchemas");
const {
  buildResumeGenerationSystemPrompt,
  buildResumeGenerationUserPrompt,
} = require("./prompts/resumeGenerate.prompts");

function sanitizeStr(s) {
  if (s == null) return "";
  return String(s).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").trim().slice(0, 10000);
}

function sanitizePromptStr(s, maxLen = 400) {
  if (s == null) return "";
  return String(s).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").trim().slice(0, maxLen);
}

function formatDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return sanitizeStr(value);
  return date.toISOString().slice(0, 10);
}

function normalizeCareerHistoryForPrompt(careerHistory) {
  if (!Array.isArray(careerHistory)) return [];

  return careerHistory.slice(0, 12).map((item) => ({
    companyName: sanitizePromptStr(item?.companyName, 120),
    roleTitle: sanitizePromptStr(item?.roleTitle, 120),
    startDate: formatDate(item?.startDate),
    endDate: formatDate(item?.endDate),
    companySummary: sanitizePromptStr(item?.companySummary, 500),
    keyPoints: Array.isArray(item?.keyPoints)
      ? item.keyPoints.map((v) => sanitizePromptStr(v, 350)).filter(Boolean).slice(0, 8)
      : [],
  }));
}

function normalizeEducationForPrompt(education) {
  if (!Array.isArray(education)) return [];

  return education.slice(0, 10).map((item) => ({
    degreeLevel: sanitizePromptStr(item?.degreeLevel, 120),
    universityName: sanitizePromptStr(item?.universityName, 160),
    major: sanitizePromptStr(item?.major, 160),
    startDate: formatDate(item?.startDate),
    endDate: formatDate(item?.endDate),
    note: sanitizePromptStr(item?.note, 240),
  }));
}

function normalizeResumeForPrompt(resume) {
  return {
    title: sanitizePromptStr(resume?.title, 120),
    summary: sanitizePromptStr(resume?.summary, 700),
    experiences: Array.isArray(resume?.experiences)
      ? resume.experiences.slice(0, 12).map((item) => ({
          title: sanitizePromptStr(item?.title ?? item?.roleTitle, 120),
          companyName: sanitizePromptStr(item?.companyName, 120),
          companyLocation: sanitizePromptStr(item?.companyLocation, 120),
          summary: sanitizePromptStr(item?.summary, 500),
          descriptions: Array.isArray(item?.descriptions)
            ? item.descriptions.map((v) => sanitizePromptStr(v, 350)).filter(Boolean).slice(0, 8)
            : [],
          startDate: formatDate(item?.startDate),
          endDate: formatDate(item?.endDate),
        }))
      : [],
    skills: Array.isArray(resume?.skills)
      ? resume.skills.slice(0, 8).map((item) => ({
          title: sanitizePromptStr(item?.title, 100),
          items: Array.isArray(item?.items)
            ? item.items.map((v) => sanitizePromptStr(v, 60)).filter(Boolean).slice(0, 25)
            : [],
        }))
      : [],
    education: normalizeEducationForPrompt(resume?.education),
  };
}

function buildResumeGenerationInput({ jd, profile, baseResume }) {
  return {
    jobDescription: {
      title: sanitizePromptStr(jd?.title, 150),
      company: sanitizePromptStr(jd?.company, 120) || "N/A",
      context: sanitizePromptStr(jd?.context, 1800) || "N/A",
      skills: Array.isArray(jd?.skills) ? jd.skills.map((v) => sanitizePromptStr(v, 80)).filter(Boolean).slice(0, 30) : [],
      niceToHave: Array.isArray(jd?.niceToHave) ? jd.niceToHave.map((v) => sanitizePromptStr(v, 120)).filter(Boolean).slice(0, 20) : [],
      requirements: Array.isArray(jd?.requirements) ? jd.requirements.map((v) => sanitizePromptStr(v, 220)).filter(Boolean).slice(0, 25) : [],
      responsibilities: Array.isArray(jd?.responsibilities) ? jd.responsibilities.map((v) => sanitizePromptStr(v, 220)).filter(Boolean).slice(0, 25) : [],
    },
    candidateProfile: {
      fullName: sanitizePromptStr(profile?.fullName, 120),
      currentTitle: sanitizePromptStr(profile?.title, 120),
      mainStack: sanitizePromptStr(profile?.mainStack, 160),
      careerHistoryContext: normalizeCareerHistoryForPrompt(profile?.careerHistory),
      education: normalizeEducationForPrompt(profile?.educations),
    },
    originalResume: normalizeResumeForPrompt(baseResume),
  };
}

function normalizeResumeJson(raw) {
  const name = sanitizeStr(raw?.name) || "Generated Resume";
  const summary = sanitizeStr(raw?.summary) || "";
  const experiences = Array.isArray(raw?.experiences)
    ? raw.experiences.slice(0, 20).map((e) => ({
        title: sanitizeStr(e?.title ?? e?.roleTitle) || "",
        companyName: sanitizeStr(e?.companyName) || "",
        companyLocation: sanitizeStr(e?.companyLocation) || "",
        summary: sanitizeStr(e?.summary) || "",
        descriptions: Array.isArray(e?.descriptions) ? e.descriptions.map(sanitizeStr).filter(Boolean) : [],
        startDate: sanitizeStr(e?.startDate) || "",
        endDate: sanitizeStr(e?.endDate) || "",
      }))
    : [];

  const skills = Array.isArray(raw?.skills)
    ? raw.skills.slice(0, 10).map((s) => ({
        title: sanitizeStr(s?.title) || "Skills",
        items: Array.isArray(s?.items) ? s.items.map(sanitizeStr).filter(Boolean).slice(0, 50) : [],
      }))
    : [];

  const education = Array.isArray(raw?.education)
    ? raw.education.slice(0, 5).map((e) => ({
        degreeLevel: sanitizeStr(e?.degreeLevel) || "",
        universityName: sanitizeStr(e?.universityName) || "",
        major: sanitizeStr(e?.major) || "",
        startDate: sanitizeStr(e?.startDate) || "",
        endDate: sanitizeStr(e?.endDate) || "",
      }))
    : [];

  return { name, summary, experiences, skills, education, pageFrameConfig: null };
}

function normalizeKey(value) {
  return sanitizeStr(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function makeExperienceKey(title, companyName) {
  return `${normalizeKey(title)}|${normalizeKey(companyName)}`;
}

function splitBulletCandidates(text) {
  const base = sanitizeStr(text);
  if (!base) return [];

  // Keep source-grounded phrasing while splitting dense bullets into multiple concise lines.
  const fragments = base
    .split(/[.;]\s+/)
    .flatMap((segment) => segment.split(/,\s+(?=(using|with|to|by|while|where|and)\b)/i))
    .map((part) => sanitizeStr(part))
    .filter(Boolean);

  return fragments.filter((part) => part.length >= 20);
}

function dedupeStrings(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const clean = sanitizeStr(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function getRoleBulletMinimum(title) {
  const t = normalizeKey(title);
  const isSenior = /\b(senior|sr|staff|lead|principal|architect|manager|director|head)\b/.test(t);
  const isJunior = /\b(junior|jr|entry|associate|assistant|intern|apprentice)\b/.test(t);
  if (isSenior) return Math.max(1, Number(GENERATE_MIN_BULLETS_SENIOR) || 5);
  if (isJunior) return Math.max(1, Number(GENERATE_MIN_BULLETS_JUNIOR) || 3);
  return Math.max(1, Number(GENERATE_MIN_BULLETS_MID) || 4);
}

function buildEvidenceMaps(profile, baseResume) {
  const byRoleAndCompany = new Map();
  const byCompany = new Map();

  const addEvidence = (title, companyName, lines) => {
    const key = makeExperienceKey(title, companyName);
    const companyKey = normalizeKey(companyName);
    const prepared = dedupeStrings((lines || []).flatMap(splitBulletCandidates));
    if (!prepared.length) return;

    const existingRoleCompany = byRoleAndCompany.get(key) || [];
    byRoleAndCompany.set(key, dedupeStrings(existingRoleCompany.concat(prepared)));

    if (companyKey) {
      const existingCompany = byCompany.get(companyKey) || [];
      byCompany.set(companyKey, dedupeStrings(existingCompany.concat(prepared)));
    }
  };

  const baseExperiences = Array.isArray(baseResume?.experiences) ? baseResume.experiences : [];
  for (const exp of baseExperiences) {
    addEvidence(exp?.title ?? exp?.roleTitle, exp?.companyName, [
      exp?.summary,
      ...(Array.isArray(exp?.descriptions) ? exp.descriptions : []),
    ]);
  }

  const profileHistory = Array.isArray(profile?.careerHistory) ? profile.careerHistory : [];
  for (const exp of profileHistory) {
    addEvidence(exp?.roleTitle, exp?.companyName, [
      exp?.companySummary,
      ...(Array.isArray(exp?.keyPoints) ? exp.keyPoints : []),
    ]);
  }

  return { byRoleAndCompany, byCompany };
}

function enforceExperienceBullets(resume, profile, baseResume) {
  const experiences = Array.isArray(resume?.experiences) ? resume.experiences : [];
  if (!experiences.length) return resume;

  const evidence = buildEvidenceMaps(profile, baseResume);

  const normalizedExperiences = experiences.map((exp) => {
    const existing = dedupeStrings(Array.isArray(exp?.descriptions) ? exp.descriptions : []);
    const minimum = getRoleBulletMinimum(exp?.title);
    const maxBullets = Math.max(minimum, 12);

    if (existing.length >= minimum) {
      return { ...exp, descriptions: existing.slice(0, maxBullets) };
    }

    const key = makeExperienceKey(exp?.title, exp?.companyName);
    const companyKey = normalizeKey(exp?.companyName);
    const evidenceCandidates = dedupeStrings([
      ...(evidence.byRoleAndCompany.get(key) || []),
      ...(evidence.byCompany.get(companyKey) || []),
      ...splitBulletCandidates(exp?.summary),
      ...existing.flatMap(splitBulletCandidates),
    ]);

    const filled = dedupeStrings(existing.concat(evidenceCandidates));
    const finalDescriptions = filled.slice(0, maxBullets);
    return { ...exp, descriptions: finalDescriptions };
  });

  return { ...resume, experiences: normalizedExperiences };
}

function extractStructuredJsonFromChat(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  if (!choice?.message?.content) return null;
  if (typeof choice.message.content === "string") {
    try {
      return JSON.parse(choice.message.content);
    } catch {
      return null;
    }
  }
  const chunk = choice.message.content.find((c) => typeof c?.text === "string");
  if (chunk?.text) {
    try {
      return JSON.parse(chunk.text);
    } catch {
      return null;
    }
  }
  return null;
}

async function callChatWithSchema(systemPrompt, userPrompt, maxCompletionTokens, model) {
  return chatCompletions({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: maxCompletionTokens,
    timeout_ms: GENERATE_TIMEOUT_MS,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "generate_resume",
        schema: resumeSchema,
        strict: false,
      },
    },
  });
}

function isLikelyTruncatedStructuredResponse(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  if (!choice) return false;
  if (choice.finish_reason === "length") return true;

  const content = choice?.message?.content;
  if (typeof content === "string") {
    return !content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    return !text;
  }
  return !content;
}

function isReasoningSaturated(body) {
  const completionTokens = Number(body?.usage?.completion_tokens || 0);
  const reasoningTokens = Number(body?.usage?.completion_tokens_details?.reasoning_tokens || 0);
  if (!completionTokens) return false;
  return reasoningTokens >= Math.floor(completionTokens * 0.95);
}

function buildFallbackResume({ jd, profile }) {
  const skillItems = Array.isArray(profile?.mainStack)
    ? [String(profile.mainStack)]
    : Array.isArray(jd?.skills)
      ? jd.skills.slice(0, 20).map((s) => String(s))
      : [];

  const experiences = Array.isArray(profile?.careerHistory)
    ? profile.careerHistory.slice(0, 12).map((e) => ({
        title: e?.roleTitle || "",
        companyName: e?.companyName || "",
        companyLocation: "",
        summary: e?.companySummary || "",
        descriptions: Array.isArray(e?.keyPoints) ? e.keyPoints : [],
        startDate: e?.startDate || "",
        endDate: e?.endDate || "",
      }))
    : [];

  const education = Array.isArray(profile?.educations)
    ? profile.educations.slice(0, 5).map((e) => ({
        degreeLevel: e?.degreeLevel || "",
        universityName: e?.universityName || "",
        major: e?.major || "",
        startDate: e?.startDate || "",
        endDate: e?.endDate || "",
      }))
    : [];

  return {
    name: `${profile?.fullName || "Resume"} - ${jd?.title || "Role"}`,
    summary: profile?.title || profile?.mainStack || "Generated resume draft",
    experiences,
    skills: [{ title: "Skills", items: skillItems }],
    education,
    pageFrameConfig: null,
  };
}

async function generateResumeFromJD({ jd, profile, baseResume }) {
  if (!jd || !profile) throw new Error("JD or profile not found");

  try {
    const llmInput = buildResumeGenerationInput({ jd, profile, baseResume });
    const systemPrompt = buildResumeGenerationSystemPrompt();
    const userPrompt = buildResumeGenerationUserPrompt(llmInput);

    let rawJson = null;
    const maxAttempts = 3;
    let maxTokens = Math.max(2000, Number(GENERATE_MAX_TOKENS) || 3000);
    const tokenCeiling = Math.max(maxTokens, Number(GENERATE_MAX_TOKEN_CEILING) || 24000);
    let model = GENERATE_REASONING_MODEL;
    const fallbackModel = GENERATE_MODEL || GENERATE_REASONING_MODEL;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const body = await callChatWithSchema(systemPrompt, userPrompt, maxTokens, model);
        rawJson = extractStructuredJsonFromChat(body);
        if (rawJson) break;

        const truncated = isLikelyTruncatedStructuredResponse(body);
        const reasoningSaturated = isReasoningSaturated(body);
        const shouldRetry = (truncated || reasoningSaturated) && attempt < maxAttempts;
        if (!shouldRetry) break;

        if (reasoningSaturated && model === GENERATE_REASONING_MODEL && fallbackModel !== GENERATE_REASONING_MODEL) {
          model = fallbackModel;
          console.warn(`[Generate] reasoning token saturation detected; switching model to ${model}`);
        }

        const nextMax = Math.min(Math.floor(maxTokens * 1.8), tokenCeiling);
        console.warn(
          `[Generate] empty/length-limited structured output; retrying with model=${model} max_completion_tokens=${nextMax}`
        );
        maxTokens = nextMax;
      }
    } catch (e) {
      console.error("[Generate] chat completions with schema FAILED");
      console.error("Status:", e?.status);
      console.error("Message:", e?.message);
      console.error("Response:", e?.body || e?.response?.data || e);

      // Fail fast to fallback on any LLM error/timeouts.
      const fallback = normalizeResumeJson(buildFallbackResume({ jd, profile }));
      return enforceExperienceBullets(fallback, profile, baseResume);
    }

    if (!rawJson) {
      console.warn("[Generate] No valid JSON; returning fallback resume");
      const fallback = normalizeResumeJson(buildFallbackResume({ jd, profile }));
      return enforceExperienceBullets(fallback, profile, baseResume);
    }

    const normalized = normalizeResumeJson(rawJson);
    return enforceExperienceBullets(normalized, profile, baseResume);
  } catch (e) {
    console.error("[Generate] unexpected error, returning fallback resume", e);
    const fallback = normalizeResumeJson(buildFallbackResume({ jd, profile }));
    return enforceExperienceBullets(fallback, profile, baseResume);
  }
}

module.exports = { generateResumeFromJD };
