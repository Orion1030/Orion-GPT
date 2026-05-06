const { chatCompletions, responsesCreate } = require("./openaiClient");
const { chatCompletionText } = require("./providerChat.client");
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
  buildManagedResumeGenerationSystemPrompt,
  buildResumeGenerationUserPrompt,
} = require("./prompts/resumeGenerate.prompts");
const { resolveManagedPromptContext } = require("../promptRuntime.service");
const { appendPromptAudit } = require("../promptAudit.service");
const {
  AI_RUNTIME_FEATURES,
  RESUME_GENERATION_MODES,
  resolveFeatureAiRuntimeConfig,
} = require("../adminConfiguration.service");
const {
  generateResumeFromJD: runResumeGeneration,
  OUTPUT_MODES,
} = require("../resume-generation/runResumeGeneration.service");
const {
  buildEmploymentKey,
  buildEmploymentBaseKey,
  normalizeEmploymentDate,
} = require("../../utils/employmentKey");
const {
  alignResumeExperiencesToCareerHistory,
  normalizeResumeExperience,
} = require("../../utils/experienceAdapter");

const MAX_CAREER_HISTORY_ITEMS = 16;
const RESUME_GENERATION_PROMPT_NAME = "resume_generation";
const SYSTEM_PROMPT_TYPE = "system";
const PROMPT_RUNTIME_ACTION = "prompt_runtime_used";

function toIdString(value, seen = new Set()) {
  if (value == null || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);

  if (typeof value === "object") {
    if (seen.has(value)) return null;
    seen.add(value);

    if (typeof value.toHexString === "function") {
      try {
        const hex = value.toHexString();
        if (hex) return String(hex);
      } catch {
        // Ignore and continue to other extraction strategies.
      }
    }

    const nestedId = value._id ?? value.id;
    if (nestedId != null) {
      const nested = toIdString(nestedId, seen);
      if (nested) return nested;
    }

    try {
      const asString = value.toString();
      if (asString && asString !== "[object Object]") return String(asString);
    } catch {
      // Ignore and fall through.
    }
    return null;
  }

  try {
    return String(value);
  } catch {
    return null;
  }
}

function sanitizePromptSource(source) {
  const normalized = sanitizeStr(source).slice(0, 80);
  return normalized || "no_prompt_configured";
}

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

function stripHtmlToText(value) {
  return sanitizeStr(value)
    .replace(/<li[^>]*>/gi, " ")
    .replace(/<\/li>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function profileKeyPointsToLines(keyPoints) {
  if (Array.isArray(keyPoints)) {
    return keyPoints
      .map((v) => sanitizePromptStr(stripHtmlToText(v), 350))
      .filter(Boolean)
      .slice(0, 8);
  }

  if (typeof keyPoints !== "string" || !keyPoints.trim()) return [];
  const raw = keyPoints.trim();

  const htmlListItems = [...raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => sanitizePromptStr(stripHtmlToText(match[1]), 350))
    .filter(Boolean)
    .slice(0, 8);
  if (htmlListItems.length) return htmlListItems;

  const textLines = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*•]+/, "").trim())
    .map((line) => sanitizePromptStr(stripHtmlToText(line), 350))
    .filter(Boolean)
    .slice(0, 8);
  if (textLines.length) return textLines;

  const single = sanitizePromptStr(stripHtmlToText(raw), 350);
  return single ? [single] : [];
}

function normalizeCareerHistoryForPrompt(careerHistory) {
  if (!Array.isArray(careerHistory)) return [];

  return careerHistory.map((item) => ({
    companyName: sanitizePromptStr(item?.companyName, 120),
    roleTitle: sanitizePromptStr(item?.roleTitle, 120),
    startDate: formatDate(item?.startDate),
    endDate: formatDate(item?.endDate),
    companySummary: sanitizePromptStr(item?.companySummary, 500),
    keyPoints: profileKeyPointsToLines(item?.keyPoints),
  }));
}

function buildEmploymentKeyForPrompt(item) {
  return buildEmploymentKey(
    {
      companyName: sanitizePromptStr(item?.companyName, 120),
      roleTitle: sanitizePromptStr(item?.roleTitle ?? item?.title, 120),
      startDate: formatDate(item?.startDate),
      endDate: formatDate(item?.endDate),
    },
    { roleFields: ["roleTitle", "title"] }
  );
}

function buildEmploymentBaseKeyForPrompt(item) {
  return buildEmploymentBaseKey(
    {
      companyName: sanitizePromptStr(item?.companyName, 120),
      roleTitle: sanitizePromptStr(item?.roleTitle ?? item?.title, 120),
      startDate: formatDate(item?.startDate),
      endDate: formatDate(item?.endDate),
    },
    { roleFields: ["roleTitle", "title"] }
  );
}

function mergeUniqueStrings(current, incoming) {
  const out = [];
  const seen = new Set();
  for (const value of [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const clean = sanitizePromptStr(value, 350);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function applyEmploymentHeaderFallback(target, source) {
  if (!target.companyName && source.companyName) target.companyName = source.companyName;
  if (!target.roleTitle && source.roleTitle) target.roleTitle = source.roleTitle;
  if (!target.startDate && source.startDate) target.startDate = source.startDate;
  if (!target.endDate && source.endDate) {
    target.endDate = source.endDate;
    return;
  }

  const targetEndDateKey = normalizeEmploymentDate(target.endDate);
  const sourceEndDateKey = normalizeEmploymentDate(source.endDate);
  // Prefer concrete dates over open-ended values when available.
  if (targetEndDateKey === "open" && sourceEndDateKey && sourceEndDateKey !== "open") {
    target.endDate = source.endDate;
  }
}

function hasCompanyContextContent(item) {
  if (!item || typeof item !== "object") return false;
  const hasSummary = Boolean(sanitizePromptStr(item.companySummary, 500));
  const hasPoints = Array.isArray(item.keyPoints) && item.keyPoints.length > 0;
  return hasSummary || hasPoints;
}

function hasCandidateExperienceContent(item) {
  if (!item || typeof item !== "object") return false;
  const hasBullets = Array.isArray(item.bullets) && item.bullets.length > 0;
  return hasBullets;
}

function normalizeProfileEmploymentForPrompt(item) {
  return {
    companyName: sanitizePromptStr(item?.companyName, 120),
    roleTitle: sanitizePromptStr(item?.roleTitle, 120),
    startDate: formatDate(item?.startDate),
    endDate: formatDate(item?.endDate),
    companyContext: {
      companySummary: sanitizePromptStr(item?.companySummary, 500),
      keyPoints: profileKeyPointsToLines(item?.keyPoints),
    },
  };
}

function normalizeResumeEmploymentForPrompt(item) {
  const normalized = normalizeResumeExperience(item);

  return {
    companyName: sanitizePromptStr(normalized.companyName, 120),
    roleTitle: sanitizePromptStr(normalized.title, 120),
    startDate: formatDate(normalized.startDate),
    endDate: formatDate(normalized.endDate),
    candidateExperience: {
      bullets: mergeUniqueStrings([], normalized.bullets).slice(0, 10),
    },
  };
}

function applyCareerHistoryLimit(items, maxItems = MAX_CAREER_HISTORY_ITEMS) {
  if (!Array.isArray(items) || items.length <= maxItems) return Array.isArray(items) ? items : [];

  const bothSources = [];
  const resumeOnly = [];
  const profileOnly = [];

  for (const item of items) {
    const hasProfile = Boolean(item?.sources?.profile);
    const hasResume = Boolean(item?.sources?.resume);
    if (hasProfile && hasResume) {
      bothSources.push(item);
      continue;
    }
    if (hasResume) {
      resumeOnly.push(item);
      continue;
    }
    profileOnly.push(item);
  }

  const out = bothSources.slice(0, maxItems);
  let remaining = maxItems - out.length;
  if (remaining <= 0) return out;

  if (resumeOnly.length && profileOnly.length) {
    let takeResume = Math.ceil(remaining / 2);
    let takeProfile = remaining - takeResume;

    takeResume = Math.min(takeResume, resumeOnly.length);
    takeProfile = Math.min(takeProfile, profileOnly.length);

    let leftover = remaining - (takeResume + takeProfile);
    while (leftover > 0) {
      if (resumeOnly.length > takeResume) {
        takeResume += 1;
        leftover -= 1;
        continue;
      }
      if (profileOnly.length > takeProfile) {
        takeProfile += 1;
        leftover -= 1;
        continue;
      }
      break;
    }

    const pickedResume = resumeOnly.slice(0, takeResume);
    const pickedProfile = profileOnly.slice(0, takeProfile);
    const maxPairLen = Math.max(pickedResume.length, pickedProfile.length);
    for (let i = 0; i < maxPairLen && out.length < maxItems; i++) {
      if (pickedResume[i] && out.length < maxItems) out.push(pickedResume[i]);
      if (pickedProfile[i] && out.length < maxItems) out.push(pickedProfile[i]);
    }

    if (out.length < maxItems) {
      const remainder = resumeOnly.slice(takeResume).concat(profileOnly.slice(takeProfile));
      for (const item of remainder) {
        if (out.length >= maxItems) break;
        out.push(item);
      }
    }
    return out;
  }

  const oneSided = resumeOnly.length ? resumeOnly : profileOnly;
  return out.concat(oneSided.slice(0, remaining)).slice(0, maxItems);
}

function buildMergedCareerHistoryForPrompt(profileCareerHistory, resumeExperiences) {
  const mergedByKey = new Map();
  const mergedByBaseKey = new Map();

  const ensureTarget = (sourceItem) => {
    const key = buildEmploymentKeyForPrompt(sourceItem);
    let target = mergedByKey.get(key);
    if (!target) {
      const baseKey = buildEmploymentBaseKeyForPrompt(sourceItem);
      const sourceEndDateKey = normalizeEmploymentDate(sourceItem?.endDate);
      const baseCandidates = mergedByBaseKey.get(baseKey) || [];
      const openEndedCandidate = baseCandidates.find((candidate) => {
        const candidateEndDateKey = normalizeEmploymentDate(candidate?.endDate);
        return sourceEndDateKey === "open" || candidateEndDateKey === "open";
      });

      if (openEndedCandidate) {
        target = openEndedCandidate;
        mergedByKey.set(key, target);
      } else {
        target = {
          companyName: sourceItem.companyName || "",
          roleTitle: sourceItem.roleTitle || "",
          startDate: sourceItem.startDate || "",
          endDate: sourceItem.endDate || "",
          companyContext: null,
          candidateExperience: null,
          sources: { profile: false, resume: false },
        };
        mergedByKey.set(key, target);
        if (baseKey) {
          mergedByBaseKey.set(baseKey, baseCandidates.concat(target));
        }
      }
    }

    applyEmploymentHeaderFallback(target, sourceItem);
    return target;
  };

  const profileItems = normalizeCareerHistoryForPrompt(profileCareerHistory);
  for (const profileItem of profileItems) {
    const normalized = normalizeProfileEmploymentForPrompt(profileItem);
    const target = ensureTarget(normalized);

    if (hasCompanyContextContent(normalized.companyContext)) {
      const existing = target.companyContext || { companySummary: "", keyPoints: [] };
      const nextSummary = sanitizePromptStr(normalized.companyContext.companySummary, 500);
      const mergedSummary = existing.companySummary && existing.companySummary.length >= nextSummary.length
        ? existing.companySummary
        : nextSummary;
      target.companyContext = {
        companySummary: mergedSummary,
        keyPoints: mergeUniqueStrings(existing.keyPoints, normalized.companyContext.keyPoints),
      };
    }
    target.sources.profile = true;
  }

  const resumeItems = Array.isArray(resumeExperiences) ? resumeExperiences : [];
  for (const resumeItem of resumeItems) {
    const normalized = normalizeResumeEmploymentForPrompt(resumeItem);
    const target = ensureTarget(normalized);

    if (hasCandidateExperienceContent(normalized.candidateExperience)) {
      const existing = target.candidateExperience || { bullets: [] };
      target.candidateExperience = {
        bullets: mergeUniqueStrings(existing.bullets, normalized.candidateExperience.bullets),
      };
    }
    target.sources.resume = true;
  }

  const normalizedItems = [...new Set(mergedByKey.values())]
    .map((item) => {
      const out = {
        companyName: item.companyName,
        roleTitle: item.roleTitle,
        startDate: item.startDate,
        endDate: item.endDate,
        sources: {
          profile: Boolean(item.sources.profile),
          resume: Boolean(item.sources.resume),
        },
      };
      if (hasCompanyContextContent(item.companyContext)) {
        out.companyContext = {
          companySummary: sanitizePromptStr(item.companyContext.companySummary, 500),
          keyPoints: mergeUniqueStrings([], item.companyContext.keyPoints).slice(0, 10),
        };
      }
      if (hasCandidateExperienceContent(item.candidateExperience)) {
        out.candidateExperience = {
          bullets: mergeUniqueStrings([], item.candidateExperience.bullets).slice(0, 12),
        };
      }
      return out;
    })
    .filter((item) => item.companyName || item.roleTitle || item.startDate || item.endDate);

  return applyCareerHistoryLimit(normalizedItems, MAX_CAREER_HISTORY_ITEMS);
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
  const input = {
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
      education: normalizeEducationForPrompt(profile?.educations),
    },
    careerHistory: buildMergedCareerHistoryForPrompt(
      profile?.careerHistory,
      Array.isArray(baseResume?.experiences) ? baseResume.experiences : []
    ),
  };

  if (baseResume) {
    input.selectedResume = normalizeResumeForPrompt(baseResume);
  }

  return input;
}

function normalizeResumeJson(raw) {
  const name = sanitizeStr(raw?.name) || "Generated Resume";
  const summary = sanitizeStr(raw?.summary) || "";
  const experiences = Array.isArray(raw?.experiences)
    ? raw.experiences.slice(0, 20).map((e) => {
        const normalized = normalizeResumeExperience(e);
        return {
          title: sanitizeStr(normalized.title) || "",
          companyName: sanitizeStr(normalized.companyName) || "",
          companyLocation: sanitizeStr(normalized.companyLocation) || "",
          bullets: dedupeStrings(normalized.bullets),
          startDate: sanitizeStr(normalized.startDate) || "",
          endDate: sanitizeStr(normalized.endDate) || "",
        };
      })
    : [];

  const skills = Array.isArray(raw?.skills)
    ? raw.skills.slice(0, 50).map((s) => ({
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

function normalizeCoverLetterJson(raw, { jd, profile } = {}) {
  const companyName = sanitizeStr(raw?.companyName) || sanitizeStr(jd?.company) || "";
  const jobTitle = sanitizeStr(raw?.jobTitle) || sanitizeStr(jd?.title) || "";
  const candidateName = sanitizeStr(profile?.fullName) || "Candidate";
  const bodyParagraphs = Array.isArray(raw?.bodyParagraphs)
    ? raw.bodyParagraphs.map((item) => sanitizeStr(item)).filter(Boolean).slice(0, 5)
    : [];

  return {
    title: sanitizeStr(raw?.title) || `${candidateName} - Cover Letter`,
    recipient: sanitizeStr(raw?.recipient) || "Hiring Manager",
    companyName,
    jobTitle,
    opening:
      sanitizeStr(raw?.opening) ||
      `I am excited to apply for the ${jobTitle || "role"}${companyName ? ` at ${companyName}` : ""}.`,
    bodyParagraphs: bodyParagraphs.length
      ? bodyParagraphs
      : [
          `${candidateName} brings experience aligned with the role requirements and can contribute with practical, grounded delivery from past work.`,
        ],
    closing:
      sanitizeStr(raw?.closing) ||
      "Thank you for your time and consideration. I would welcome the opportunity to discuss how my background fits this role.",
    signature: sanitizeStr(raw?.signature) || candidateName,
  };
}

function alignResumeWithProfileCareerHistory(resume, profile) {
  if (!resume || typeof resume !== "object") return resume;
  const experiences = alignResumeExperiencesToCareerHistory(profile?.careerHistory, resume.experiences);
  return { ...resume, experiences };
}

function normalizeKey(value) {
  return sanitizeStr(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function makeDateKey(value) {
  return normalizeKey(formatDate(value));
}

function makeExperienceKey(title, companyName, startDate, endDate) {
  return `${normalizeKey(title)}|${normalizeKey(companyName)}|${makeDateKey(startDate)}|${makeDateKey(endDate)}`;
}

function makeCompanyPeriodKey(companyName, startDate, endDate) {
  return `${normalizeKey(companyName)}|${makeDateKey(startDate)}|${makeDateKey(endDate)}`;
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
  const byRoleAndCompanyPeriod = new Map();
  const byCompanyAndPeriod = new Map();
  const byCompany = new Map();

  const addEvidence = (title, companyName, startDate, endDate, lines) => {
    const key = makeExperienceKey(title, companyName, startDate, endDate);
    const companyPeriodKey = makeCompanyPeriodKey(companyName, startDate, endDate);
    const companyKey = normalizeKey(companyName);
    const prepared = dedupeStrings((lines || []).flatMap(splitBulletCandidates));
    if (!prepared.length) return;

    const existingRoleCompany = byRoleAndCompanyPeriod.get(key) || [];
    byRoleAndCompanyPeriod.set(key, dedupeStrings(existingRoleCompany.concat(prepared)));

    const existingCompanyPeriod = byCompanyAndPeriod.get(companyPeriodKey) || [];
    byCompanyAndPeriod.set(companyPeriodKey, dedupeStrings(existingCompanyPeriod.concat(prepared)));

    if (companyKey) {
      const existingCompany = byCompany.get(companyKey) || [];
      byCompany.set(companyKey, dedupeStrings(existingCompany.concat(prepared)));
    }
  };

  const baseExperiences = Array.isArray(baseResume?.experiences) ? baseResume.experiences : [];
  for (const exp of baseExperiences) {
    const normalized = normalizeResumeExperience(exp);
    addEvidence(
      normalized.title,
      normalized.companyName,
      normalized.startDate,
      normalized.endDate,
      normalized.bullets
    );
  }

  const profileHistory = Array.isArray(profile?.careerHistory) ? profile.careerHistory : [];
  for (const exp of profileHistory) {
    addEvidence(exp?.roleTitle, exp?.companyName, exp?.startDate, exp?.endDate, [
      exp?.companySummary,
      ...profileKeyPointsToLines(exp?.keyPoints),
    ]);
  }

  return { byRoleAndCompanyPeriod, byCompanyAndPeriod, byCompany };
}

function enforceExperienceBullets(resume, profile, baseResume) {
  const experiences = Array.isArray(resume?.experiences) ? resume.experiences : [];
  if (!experiences.length) return resume;

  const evidence = buildEvidenceMaps(profile, baseResume);

  const normalizedExperiences = experiences.map((exp) => {
    const existing = dedupeStrings(normalizeResumeExperience(exp).bullets);
    const minimum = getRoleBulletMinimum(exp?.title);
    const maxBullets = Math.max(minimum, 12);

    if (existing.length >= minimum) {
      return { ...exp, bullets: existing.slice(0, maxBullets) };
    }

    const key = makeExperienceKey(exp?.title, exp?.companyName, exp?.startDate, exp?.endDate);
    const companyPeriodKey = makeCompanyPeriodKey(exp?.companyName, exp?.startDate, exp?.endDate);
    const companyKey = normalizeKey(exp?.companyName);
    const scopedEvidence = dedupeStrings([
      ...(evidence.byRoleAndCompanyPeriod.get(key) || []),
      ...(evidence.byCompanyAndPeriod.get(companyPeriodKey) || []),
    ]);
    let evidenceCandidates = dedupeStrings([
      ...scopedEvidence,
      ...splitBulletCandidates(exp?.summary),
      ...existing.flatMap(splitBulletCandidates),
    ]);

    let filled = dedupeStrings(existing.concat(evidenceCandidates));
    if (filled.length < minimum && !scopedEvidence.length) {
      evidenceCandidates = dedupeStrings(evidenceCandidates.concat(evidence.byCompany.get(companyKey) || []));
      filled = dedupeStrings(existing.concat(evidenceCandidates));
    }

    const finalBullets = filled.slice(0, maxBullets);
    return { ...exp, bullets: finalBullets };
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
      return extractJsonObjectFromText(choice.message.content);
    }
  }
  const chunk = choice.message.content.find((c) => typeof c?.text === "string");
  if (chunk?.text) {
    try {
      return JSON.parse(chunk.text);
    } catch {
      return extractJsonObjectFromText(chunk.text);
    }
  }
  return null;
}

function extractJsonObjectFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Continue to extraction fallback.
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  const extracted = raw.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(extracted);
  } catch {
    const repaired = extracted.replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

function buildJsonOnlyPrompt(userPrompt) {
  return `${userPrompt}

## Critical response format:
- Return only a single valid JSON object.
- Do not wrap JSON in markdown fences.
- Do not include explanations or extra text.`;
}

function supportsOpenAiReasoningModel(model) {
  const normalized = sanitizePromptStr(model, 120).toLowerCase();
  if (!normalized) return false;
  return /^gpt-5(?:[.-]|$)/.test(normalized) || /^o[134](?:[.-]|$)/.test(normalized);
}

function extractTextFromResponsesOutput(body) {
  if (typeof body?.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  const output = Array.isArray(body?.output) ? body.output : [];
  const parts = [];

  for (const item of output) {
    if (typeof item?.content === "string" && item.content.trim()) {
      parts.push(item.content);
      continue;
    }

    const content = Array.isArray(item?.content) ? item.content : [];
    for (const chunk of content) {
      if (typeof chunk?.text === "string" && chunk.text.trim()) {
        parts.push(chunk.text);
        continue;
      }
      if (typeof chunk?.content === "string" && chunk.content.trim()) {
        parts.push(chunk.content);
      }
    }
  }

  return parts.join("\n").trim();
}

function extractStructuredJsonFromResponses(body) {
  const text = extractTextFromResponsesOutput(body);
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return extractJsonObjectFromText(text);
  }
}

async function callReasoningWithSchema(
  systemPrompt,
  userPrompt,
  maxOutputTokens,
  model,
  runtimeConfig = null
) {
  const response = await responsesCreate({
    apiKey: runtimeConfig?.useCustom && runtimeConfig?.provider === "openai"
      ? runtimeConfig.apiKey
      : undefined,
    model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildJsonOnlyPrompt(userPrompt) },
    ],
    max_output_tokens: maxOutputTokens,
    timeout_ms: GENERATE_TIMEOUT_MS,
    reasoning: {
      effort: "medium",
    },
    text: {
      format: {
        type: "json_schema",
        name: "generate_resume",
        schema: resumeSchema,
        strict: false,
      },
    },
  });

  return {
    output: Array.isArray(response?.output) ? response.output : [],
    output_text: extractTextFromResponsesOutput(response),
    usage: response?.usage || null,
    status: response?.status || null,
  };
}

async function callChatWithSchema(systemPrompt, userPrompt, maxCompletionTokens, model, runtimeConfig = null) {
  if (runtimeConfig?.useCustom) {
    const providerResult = await chatCompletionText({
      provider: runtimeConfig.provider,
      apiKey: runtimeConfig.apiKey,
      model: runtimeConfig.model || model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildJsonOnlyPrompt(userPrompt) },
      ],
      maxTokens: maxCompletionTokens,
      timeoutMs: GENERATE_TIMEOUT_MS,
      temperature: 0,
      expectJson: true,
    });

    return {
      choices: [
        {
          finish_reason: providerResult?.finishReason || null,
          message: {
            content: providerResult?.text || "",
          },
        },
      ],
      usage: providerResult?.usage || null,
    };
  }

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

function resolveResumeGenerationMode(runtimeConfig) {
  return runtimeConfig?.resumeGenerationMode === RESUME_GENERATION_MODES.REASONING
    ? RESUME_GENERATION_MODES.REASONING
    : RESUME_GENERATION_MODES.LEGACY;
}

function isReasoningModeSupported(runtimeConfig, model) {
  if (!runtimeConfig?.useCustom) return true;
  if (runtimeConfig?.provider !== "openai") return false;
  return supportsOpenAiReasoningModel(model);
}

function getInitialGenerationModel(runtimeConfig, resumeGenerationMode) {
  if (runtimeConfig?.useCustom) {
    return runtimeConfig.model;
  }
  if (resumeGenerationMode === RESUME_GENERATION_MODES.REASONING) {
    return GENERATE_REASONING_MODEL;
  }
  return GENERATE_MODEL || GENERATE_REASONING_MODEL;
}

function buildFallbackResume({ jd, profile }) {
  const profileStackItems = Array.isArray(profile?.mainStack)
    ? profile.mainStack.map((s) => sanitizeStr(s)).filter(Boolean)
    : (() => {
        const single = sanitizeStr(profile?.mainStack);
        return single ? [single] : [];
      })();
  const skillItems = profileStackItems.length
    ? profileStackItems.slice(0, 20)
    : Array.isArray(jd?.skills)
      ? jd.skills.slice(0, 20).map((s) => String(s))
      : [];

  const experiences = Array.isArray(profile?.careerHistory)
    ? profile.careerHistory.slice(0, 12).map((e) => ({
        title: e?.roleTitle || "",
        companyName: e?.companyName || "",
        companyLocation: "",
        bullets: dedupeStrings([
          sanitizePromptStr(e?.companySummary, 500),
          ...profileKeyPointsToLines(e?.keyPoints),
        ]),
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

async function appendPromptRuntimeAuditEvent({
  profile,
  resolvedPrompt,
  usedGuardrailedManagedPrompt = false,
  auditContext = {},
} = {}) {
  try {
    if (process.env.NODE_ENV === "test") return;
    const ownerUserId = toIdString(profile?.userId);
    if (!ownerUserId) return;
    const scopedProfileId = toIdString(profile?._id);

    await appendPromptAudit({
      ownerUserId,
      actorUserId: auditContext?.actorUserId || null,
      actorType: auditContext?.actorType || "system",
      action: PROMPT_RUNTIME_ACTION,
      promptId: resolvedPrompt?.promptId || null,
      promptName: RESUME_GENERATION_PROMPT_NAME,
      type: SYSTEM_PROMPT_TYPE,
      profileId: scopedProfileId,
      beforeContext: null,
      afterContext: null,
      payload: {
        resolvedFrom: sanitizePromptSource(resolvedPrompt?.source),
        usedManagedPrompt: Boolean(
          resolvedPrompt?.source &&
            resolvedPrompt.source !== "fallback_runtime" &&
            resolvedPrompt.source !== "no_prompt_configured" &&
            resolvedPrompt.promptId
        ),
        usedGuardrailedManagedPrompt: Boolean(usedGuardrailedManagedPrompt),
        resolvedPromptId: resolvedPrompt?.promptId || null,
        resolvedPromptUpdatedAt: resolvedPrompt?.promptUpdatedAt || null,
        jobDescriptionId: auditContext?.jobDescriptionId || null,
        profileId: scopedProfileId || auditContext?.profileId || null,
        baseResumeId: auditContext?.baseResumeId || null,
        applicationId: auditContext?.applicationId || null,
        trigger: auditContext?.trigger || "resume_generate",
      },
      requestId: auditContext?.requestId || null,
      source: auditContext?.source || "llm.resume_generation",
      ip: auditContext?.ip || "",
      userAgent: auditContext?.userAgent || "",
    });
  } catch (error) {
    console.warn(
      "[PromptAudit] failed to append runtime usage event",
      error?.message || error
    );
  }
}

async function generateResumeFromJD({ jd, profile, baseResume, auditContext = null }) {
  return runResumeGeneration({
    jd,
    profile,
    baseResume,
    auditContext,
    helperSet: {
      buildFallbackResume,
      buildResumeGenerationInput,
      enforceExperienceBullets,
      normalizeResumeJson,
      normalizeCoverLetterJson,
      alignResumeWithProfileCareerHistory,
    },
  });
}

async function generateApplicationMaterialsFromJD({ jd, profile, baseResume, auditContext = null }) {
  return runResumeGeneration({
    jd,
    profile,
    baseResume,
    auditContext,
    outputMode: OUTPUT_MODES.APPLICATION_MATERIALS,
    helperSet: {
      buildFallbackResume,
      buildResumeGenerationInput,
      enforceExperienceBullets,
      normalizeResumeJson,
      normalizeCoverLetterJson,
      alignResumeWithProfileCareerHistory,
    },
  });
}

module.exports = {
  generateResumeFromJD,
  generateApplicationMaterialsFromJD,
  _buildResumeGenerationInput: buildResumeGenerationInput,
  _buildMergedCareerHistoryForPrompt: buildMergedCareerHistoryForPrompt,
  _buildEmploymentKeyForPrompt: buildEmploymentKeyForPrompt,
  _enforceExperienceBullets: enforceExperienceBullets,
  _normalizeCoverLetterJson: normalizeCoverLetterJson,
};
