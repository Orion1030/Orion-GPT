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
const {
  buildEmploymentKey,
  buildEmploymentBaseKey,
  normalizeEmploymentDate,
} = require("../../utils/employmentKey");
const { alignResumeExperiencesToCareerHistory } = require("../../utils/experienceAdapter");

const MAX_CAREER_HISTORY_ITEMS = 16;

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
  const hasSummary = Boolean(sanitizePromptStr(item.summary, 500));
  const hasDescriptions = Array.isArray(item.descriptions) && item.descriptions.length > 0;
  return hasSummary || hasDescriptions;
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
  return {
    companyName: sanitizePromptStr(item?.companyName, 120),
    roleTitle: sanitizePromptStr(item?.title ?? item?.roleTitle, 120),
    startDate: formatDate(item?.startDate),
    endDate: formatDate(item?.endDate),
    candidateExperience: {
      summary: sanitizePromptStr(item?.summary, 500),
      descriptions: Array.isArray(item?.descriptions)
        ? item.descriptions.map((v) => sanitizePromptStr(v, 350)).filter(Boolean).slice(0, 10)
        : [],
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
      const existing = target.candidateExperience || { summary: "", descriptions: [] };
      const nextSummary = sanitizePromptStr(normalized.candidateExperience.summary, 500);
      const mergedSummary = existing.summary && existing.summary.length >= nextSummary.length
        ? existing.summary
        : nextSummary;
      target.candidateExperience = {
        summary: mergedSummary,
        descriptions: mergeUniqueStrings(existing.descriptions, normalized.candidateExperience.descriptions),
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
          summary: sanitizePromptStr(item.candidateExperience.summary, 500),
          descriptions: mergeUniqueStrings([], item.candidateExperience.descriptions).slice(0, 12),
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
    addEvidence(exp?.title ?? exp?.roleTitle, exp?.companyName, exp?.startDate, exp?.endDate, [
      exp?.summary,
      ...(Array.isArray(exp?.descriptions) ? exp.descriptions : []),
    ]);
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
    const existing = dedupeStrings(Array.isArray(exp?.descriptions) ? exp.descriptions : []);
    const minimum = getRoleBulletMinimum(exp?.title);
    const maxBullets = Math.max(minimum, 12);

    if (existing.length >= minimum) {
      return { ...exp, descriptions: existing.slice(0, maxBullets) };
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
        summary: e?.companySummary || "",
        descriptions: profileKeyPointsToLines(e?.keyPoints),
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
      const fallback = alignResumeWithProfileCareerHistory(
        normalizeResumeJson(buildFallbackResume({ jd, profile })),
        profile
      );
      return enforceExperienceBullets(fallback, profile, baseResume);
    }

    if (!rawJson) {
      console.warn("[Generate] No valid JSON; returning fallback resume");
      const fallback = alignResumeWithProfileCareerHistory(
        normalizeResumeJson(buildFallbackResume({ jd, profile })),
        profile
      );
      return enforceExperienceBullets(fallback, profile, baseResume);
    }

    const normalized = alignResumeWithProfileCareerHistory(normalizeResumeJson(rawJson), profile);
    return enforceExperienceBullets(normalized, profile, baseResume);
  } catch (e) {
    console.error("[Generate] unexpected error, returning fallback resume", e);
    const fallback = alignResumeWithProfileCareerHistory(
      normalizeResumeJson(buildFallbackResume({ jd, profile })),
      profile
    );
    return enforceExperienceBullets(fallback, profile, baseResume);
  }
}

module.exports = {
  generateResumeFromJD,
  _buildResumeGenerationInput: buildResumeGenerationInput,
  _buildMergedCareerHistoryForPrompt: buildMergedCareerHistoryForPrompt,
  _buildEmploymentKeyForPrompt: buildEmploymentKeyForPrompt,
  _enforceExperienceBullets: enforceExperienceBullets,
};
