const { ProfileModel, StackModel } = require("../dbModels");
const { tryParseResumeTextWithLLM } = require("../utils/parseResume");
const { buildReadableProfileFilterForUser } = require("./profileAccess.service");
const { normalizeSkill, normalizeSkills } = require("../utils/skillNormalizer");
const { areEmploymentsEquivalent, normalizeEmploymentText } = require("../utils/employmentKey");
const { RoleLevels } = require("../utils/constants");
const { toIdString } = require("../utils/managementScope");
const {
  normalizeImportedDateRange,
  sortCareerHistoryMostRecentFirst,
  stripTrailingImportedDateRange,
} = require("../utils/flexibleDate");

function toCleanString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[\s,;|\/\\\-\(\)\[\]:]+/)
    .map((token) => token.replace(/[^a-z0-9#+.]/g, ""))
    .filter((token) => token.length > 1);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtmlToText(value) {
  return String(value || "")
    .replace(/<li[^>]*>/gi, " ")
    .replace(/<\/li>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toListHtml(lines) {
  const items = (Array.isArray(lines) ? lines : [])
    .map((line) => toCleanString(line))
    .filter(Boolean)
    .map((line) => `<li>${escapeHtml(line)}</li>`);
  if (!items.length) return "";
  return `<ul>${items.join("")}</ul>`;
}

function normalizeUrlCandidate(value) {
  const raw = toCleanString(value).replace(/[),.;]+$/g, "");
  if (!raw) return "";

  const withProtocol = /^(https?:)?\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function extractFirstMatch(text, regex, mapper = null) {
  const match = String(text || "").match(regex);
  if (!match || !match[0]) return "";
  const raw = toCleanString(match[0]);
  if (!raw) return "";
  return mapper ? mapper(raw) : raw;
}

function extractAllMatches(text, regex, mapper = null) {
  const matches = String(text || "").match(regex) || [];
  return matches
    .map((value) => (mapper ? mapper(value) : toCleanString(value)))
    .filter(Boolean);
}

function extractContactInfoFromText(text) {
  const source = String(text || "");
  const email = extractFirstMatch(
    source,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  );
  const linkedin = extractFirstMatch(
    source,
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s<>"'|)]+/i,
    normalizeUrlCandidate
  );
  const github = extractFirstMatch(
    source,
    /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s<>"'|)]+/i,
    normalizeUrlCandidate
  );
  const website = extractAllMatches(
    source,
    /(?:https?:\/\/|www\.)[^\s<>"'|)]+/gi,
    normalizeUrlCandidate
  ).find((value) => {
    const host = value.toLowerCase();
    return !host.includes("linkedin.com/") && !host.includes("github.com/");
  }) || "";
  const phone = extractFirstMatch(
    source,
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?){2}\d{4}/
  );

  return {
    email,
    phone,
    linkedin,
    github,
    website,
    address: "",
  };
}

function extractLikelyNameFromText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => toCleanString(line))
    .filter(Boolean)
    .slice(0, 10);

  for (const line of lines) {
    if (line.length > 80) continue;
    if (/@/.test(line)) continue;
    if (/linkedin\.com|github\.com|https?:\/\//i.test(line)) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5 && /[A-Za-z]/.test(line)) {
      return line;
    }
  }
  return "";
}

function normalizeTitleCandidate(value) {
  const raw = toCleanString(value)
    .replace(/\s*[|/]\s*/g, " | ")
    .replace(/\s+/g, " ");
  if (!raw) return "";

  const primarySegment = raw.split("|")[0].trim();
  const candidate = primarySegment || raw;
  if (!candidate || candidate.length > 90) return "";
  return candidate;
}

function looksLikeContactLine(line) {
  return /@|https?:\/\/|www\.|linkedin\.com|github\.com|\+?\d[\d\s().-]{6,}/i.test(
    line
  );
}

function looksLikeRoleTitle(line) {
  return /\b(engineer|developer|architect|manager|lead|director|analyst|scientist|consultant|specialist|administrator|designer|sre|devops|product|project|data|software|frontend|backend|full stack|platform|qa|test)\b/i.test(
    line
  );
}

function extractHeaderTitleFromText(text, fullName = "") {
  const normalizedName = normalizeEmploymentText(fullName);
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => toCleanString(line))
    .filter(Boolean)
    .slice(0, 12);

  for (const line of lines) {
    if (!line || line.length > 90) continue;
    if (looksLikeContactLine(line)) continue;
    if (/resume|curriculum vitae/i.test(line)) continue;
    if (normalizeEmploymentText(line) === normalizedName) continue;
    if (!looksLikeRoleTitle(line)) continue;

    const normalized = normalizeTitleCandidate(line);
    if (normalized) return normalized;
  }

  return "";
}

function extractTitleFromSummary(summary) {
  const raw = toCleanString(summary);
  if (!raw || raw.length > 140) return "";

  const firstSentence = raw.split(/[.!?]/)[0].trim();
  if (!firstSentence || firstSentence.length > 90) return "";
  if (!looksLikeRoleTitle(firstSentence)) return "";

  const beforeWith = firstSentence.split(/\bwith\b/i)[0].trim();
  return normalizeTitleCandidate(beforeWith);
}

function buildTitleCandidates(parsed, text, fullName) {
  const candidates = [];
  const push = (value) => {
    const normalized = normalizeTitleCandidate(value);
    if (!normalized) return;
    if (normalizeEmploymentText(normalized) === normalizeEmploymentText(fullName)) return;
    if (candidates.some((item) => normalizeEmploymentText(item) === normalizeEmploymentText(normalized))) {
      return;
    }
    candidates.push(normalized);
  };

  push(extractHeaderTitleFromText(text, fullName));
  push(extractTitleFromSummary(parsed?.summary));

  const experiences = Array.isArray(parsed?.experiences) ? parsed.experiences : [];
  for (const experience of experiences) {
    push(experience?.title);
  }

  return candidates.slice(0, 5);
}

function extractAddressFromText(text, fullName = "") {
  const normalizedName = normalizeEmploymentText(fullName);
  const stateCodePattern = /\b[A-Z]{2}\b/;
  const stateNamePattern =
    /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i;
  const streetPattern = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|way|pkwy|parkway)\b/i;

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => toCleanString(line))
    .filter(Boolean)
    .slice(0, 12);

  for (const line of lines) {
    if (!line || line.length > 120) continue;
    if (looksLikeContactLine(line)) continue;
    if (normalizeEmploymentText(line) === normalizedName) continue;

    const looksLikeAddress =
      /\d{5}(?:-\d{4})?\b/.test(line) ||
      streetPattern.test(line) ||
      (/,/.test(line) && stateCodePattern.test(line)) ||
      (/,/.test(line) && stateNamePattern.test(line)) ||
      /\bremote\b/i.test(line);

    if (looksLikeAddress) return line;
  }

  return "";
}

function flattenParsedSkillItems(skills) {
  if (!Array.isArray(skills)) return [];

  const flat = [];
  for (const section of skills) {
    if (typeof section === "string") {
      flat.push(section);
      continue;
    }
    if (!section || typeof section !== "object") continue;

    if (Array.isArray(section.items)) {
      for (const item of section.items) {
        if (typeof item === "string") flat.push(item);
      }
      continue;
    }

    if (typeof section.title === "string") {
      flat.push(section.title);
    }
  }

  return normalizeSkills(flat);
}

function normalizeParsedEducations(education) {
  if (!Array.isArray(education)) return [];

  return education
    .map((entry) => {
      const normalizedEntry =
        typeof entry === "string"
          ? {
              universityName: toCleanString(entry),
              degreeLevel: "",
              major: "",
              startDate: "",
              endDate: "",
              note: "",
            }
          : {
              universityName: toCleanString(entry?.universityName),
              degreeLevel: toCleanString(entry?.degreeLevel),
              major: toCleanString(entry?.major),
              startDate: toCleanString(entry?.startDate),
              endDate: toCleanString(entry?.endDate),
              note: "",
            };
      const normalizedDates = normalizeImportedDateRange(
        normalizedEntry.startDate,
        normalizedEntry.endDate,
        [
          normalizedEntry.universityName,
          normalizedEntry.degreeLevel,
          normalizedEntry.major,
        ]
      );

      return {
        ...normalizedEntry,
        universityName: stripTrailingImportedDateRange(
          normalizedEntry.universityName
        ),
        startDate: normalizedDates.startDate,
        endDate: normalizedDates.endDate,
      };
    })
    .filter(
      (entry) =>
        entry.universityName ||
        entry.degreeLevel ||
        entry.major ||
        entry.startDate ||
        entry.endDate
    );
}

function normalizeParsedCareerHistory(experiences) {
  if (!Array.isArray(experiences)) return [];

  return sortCareerHistoryMostRecentFirst(
    experiences
      .map((entry) => {
      const descriptions = Array.isArray(entry?.descriptions)
        ? entry.descriptions.map((line) => toCleanString(line)).filter(Boolean)
        : [];

      const normalizedEntry = {
        companyName: toCleanString(entry?.companyName),
        roleTitle: toCleanString(entry?.title),
        startDate: toCleanString(entry?.startDate),
        endDate: toCleanString(entry?.endDate),
        companySummary: toCleanString(entry?.summary),
        keyPoints: toListHtml(descriptions),
      };
      const normalizedDates = normalizeImportedDateRange(
        normalizedEntry.startDate,
        normalizedEntry.endDate,
        [
          normalizedEntry.roleTitle,
          normalizedEntry.companyName,
          normalizedEntry.companySummary,
        ]
      );

      return {
        ...normalizedEntry,
        roleTitle: stripTrailingImportedDateRange(normalizedEntry.roleTitle),
        startDate: normalizedDates.startDate,
        endDate: normalizedDates.endDate,
      };
      })
      .filter(
        (entry) =>
          entry.companyName ||
          entry.roleTitle ||
          entry.startDate ||
          entry.endDate ||
          entry.companySummary ||
          entry.keyPoints
      )
  );
}

function inferProfileTitle(parsed, text, fullName = "") {
  const candidates = buildTitleCandidates(parsed, text, fullName);
  return candidates[0] || "";
}

function buildCandidateTokenSet(draft) {
  const normalizedSkills = Array.isArray(draft?.inferredSkills) ? draft.inferredSkills : [];
  const keyPointsText = (draft?.careerHistory || [])
    .map((entry) => stripHtmlToText(entry?.keyPoints))
    .join(" ");
  const combined = [
    draft?.fullName,
    draft?.title,
    draft?.mainStack,
    draft?.sourceSummary,
    normalizedSkills.join(" "),
    (draft?.careerHistory || [])
      .map((entry) => [entry?.roleTitle, entry?.companyName, entry?.companySummary].join(" "))
      .join(" "),
    keyPointsText,
  ].join(" ");

  return new Set(tokenize(combined));
}

function candidateContainsSkill(skill, candidateTokens, explicitSkillSet) {
  const normalized = normalizeSkill(skill);
  if (!normalized) return false;
  if (explicitSkillSet.has(normalized.toLowerCase())) return true;

  const skillTokens = tokenize(normalized);
  if (!skillTokens.length) return false;
  return skillTokens.every((token) =>
    [...candidateTokens].some((candidateToken) => candidateToken === token || candidateToken.includes(token) || token.includes(candidateToken))
  );
}

function suggestStacksForDraft(stacks, draft) {
  const explicitSkillSet = new Set(
    (Array.isArray(draft?.inferredSkills) ? draft.inferredSkills : []).map((skill) =>
      normalizeSkill(skill).toLowerCase()
    )
  );
  const candidateTokens = buildCandidateTokenSet(draft);

  const suggestions = (Array.isArray(stacks) ? stacks : [])
    .map((stack) => {
      const primarySkills = normalizeSkills(
        Array.isArray(stack?.primarySkills) ? stack.primarySkills : []
      );
      const secondarySkills = normalizeSkills(
        Array.isArray(stack?.SecondarySkills)
          ? stack.SecondarySkills
          : Array.isArray(stack?.secondarySkills)
            ? stack.secondarySkills
            : []
      );
      const titleTokens = tokenize(stack?.title);

      const matchedPrimarySkills = primarySkills.filter((skill) =>
        candidateContainsSkill(skill, candidateTokens, explicitSkillSet)
      );
      const matchedSecondarySkills = secondarySkills.filter((skill) =>
        candidateContainsSkill(skill, candidateTokens, explicitSkillSet)
      );
      const matchedTitleTokens = titleTokens.filter((token) =>
        [...candidateTokens].some((candidateToken) => candidateToken === token || candidateToken.includes(token))
      );

      const primaryWeight = primarySkills.length * 6;
      const secondaryWeight = secondarySkills.length * 3;
      const titleWeight = titleTokens.length * 8;
      const totalWeight = primaryWeight + secondaryWeight + titleWeight;
      if (!totalWeight) return null;

      const matchedWeight =
        matchedPrimarySkills.length * 6 +
        matchedSecondarySkills.length * 3 +
        matchedTitleTokens.length * 8;

      const score = Math.min(100, Math.round((matchedWeight / totalWeight) * 100));
      if (score <= 0) return null;

      return {
        stackId: toIdString(stack?._id || stack?.id),
        title: toCleanString(stack?.title),
        score,
        matchedPrimarySkills,
        matchedSecondarySkills,
        matchedTitleTokens,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rightMatchCount =
        right.matchedPrimarySkills.length +
        right.matchedSecondarySkills.length +
        right.matchedTitleTokens.length;
      const leftMatchCount =
        left.matchedPrimarySkills.length +
        left.matchedSecondarySkills.length +
        left.matchedTitleTokens.length;
      return rightMatchCount - leftMatchCount;
    })
    .slice(0, 5);

  return suggestions;
}

function splitNameParts(name) {
  const normalized = normalizeEmploymentText(name);
  const parts = normalized.split(" ").filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  return {
    first: parts[0] || "",
    last: parts[parts.length - 1] || "",
  };
}

function buildProfilePreview(profile) {
  return {
    _id: toIdString(profile?._id || profile?.id),
    fullName: toCleanString(profile?.fullName),
    title: toCleanString(profile?.title),
    mainStack: toCleanString(profile?.mainStack),
    status: profile?.status,
    updatedAt: profile?.updatedAt || null,
    contactInfo: {
      email: toCleanString(profile?.contactInfo?.email),
      phone: toCleanString(profile?.contactInfo?.phone),
      linkedin: toCleanString(profile?.contactInfo?.linkedin),
    },
  };
}

function computeCareerOverlap(profileCareerHistory, draftCareerHistory) {
  const profileItems = Array.isArray(profileCareerHistory) ? [...profileCareerHistory] : [];
  const importedItems = Array.isArray(draftCareerHistory) ? draftCareerHistory : [];

  let exactOverlap = 0;
  let companyOnlyOverlap = 0;
  const remainingProfileItems = [...profileItems];

  for (const importedItem of importedItems) {
    const exactIndex = remainingProfileItems.findIndex((profileItem) =>
      areEmploymentsEquivalent(importedItem, profileItem, {
        allowOpenEndDateMismatch: true,
        leftOptions: { roleFields: ["roleTitle"] },
        rightOptions: { roleFields: ["roleTitle"] },
      })
    );
    if (exactIndex >= 0) {
      exactOverlap += 1;
      remainingProfileItems.splice(exactIndex, 1);
      continue;
    }

    const importedCompany = normalizeEmploymentText(importedItem?.companyName);
    const companyIndex = remainingProfileItems.findIndex(
      (profileItem) =>
        importedCompany &&
        normalizeEmploymentText(profileItem?.companyName) === importedCompany
    );
    if (companyIndex >= 0) {
      companyOnlyOverlap += 1;
      remainingProfileItems.splice(companyIndex, 1);
    }
  }

  const importedCount = importedItems.length || 1;
  const exactRatio = exactOverlap / importedCount;
  const companyRatio = companyOnlyOverlap / importedCount;
  const score = Math.min(
    35,
    Math.round(exactRatio * 28 + companyRatio * 12)
  );

  return {
    score,
    exactOverlap,
    companyOnlyOverlap,
  };
}

function computeTitleSimilarityScore(profile, draft) {
  const profileTitleTokens = new Set(tokenize(profile?.title));
  const draftTitleTokens = new Set(tokenize(draft?.title));
  if (!profileTitleTokens.size || !draftTitleTokens.size) return { score: 0, overlap: 0 };

  let overlap = 0;
  draftTitleTokens.forEach((token) => {
    if (profileTitleTokens.has(token)) overlap += 1;
  });

  const ratio = overlap / draftTitleTokens.size;
  return {
    score: Math.min(10, Math.round(ratio * 10)),
    overlap,
  };
}

function computeStackSimilarityScore(profile, draft) {
  const profileTokens = new Set(tokenize(profile?.mainStack));
  const draftTokens = new Set(tokenize(draft?.mainStack || draft?.title));
  if (!profileTokens.size || !draftTokens.size) return { score: 0, overlap: 0 };

  let overlap = 0;
  draftTokens.forEach((token) => {
    if (profileTokens.has(token)) overlap += 1;
  });

  return {
    score: Math.min(10, overlap * 5),
    overlap,
  };
}

function scoreExistingProfileMatch(profile, draft) {
  const draftEmail = toCleanString(draft?.contactInfo?.email).toLowerCase();
  const profileEmail = toCleanString(profile?.contactInfo?.email).toLowerCase();
  const draftLinkedIn = toCleanString(draft?.contactInfo?.linkedin).toLowerCase();
  const profileLinkedIn = toCleanString(profile?.contactInfo?.linkedin).toLowerCase();
  const draftName = normalizeEmploymentText(draft?.fullName);
  const profileName = normalizeEmploymentText(profile?.fullName);

  const breakdown = {
    identity: 0,
    career: 0,
    title: 0,
    stack: 0,
  };
  const reasons = [];

  if (draftEmail && profileEmail && draftEmail === profileEmail) {
    breakdown.identity += 45;
    reasons.push("email");
  }

  if (draftLinkedIn && profileLinkedIn && draftLinkedIn === profileLinkedIn) {
    breakdown.identity += 40;
    reasons.push("linkedin");
  }

  if (draftName && profileName) {
    if (draftName === profileName) {
      breakdown.identity += 25;
      reasons.push("full_name");
    } else {
      const draftParts = splitNameParts(draft?.fullName);
      const profileParts = splitNameParts(profile?.fullName);
      if (
        draftParts.first &&
        draftParts.last &&
        draftParts.first === profileParts.first &&
        draftParts.last === profileParts.last
      ) {
        breakdown.identity += 18;
        reasons.push("name_parts");
      }
    }
  }

  const careerOverlap = computeCareerOverlap(profile?.careerHistory, draft?.careerHistory);
  if (careerOverlap.score > 0) {
    breakdown.career = careerOverlap.score;
    reasons.push("career_history");
  }

  const titleSimilarity = computeTitleSimilarityScore(profile, draft);
  if (titleSimilarity.score > 0) {
    breakdown.title = titleSimilarity.score;
    reasons.push("title_similarity");
  }

  const stackSimilarity = computeStackSimilarityScore(profile, draft);
  if (stackSimilarity.score > 0) {
    breakdown.stack = stackSimilarity.score;
    reasons.push("stack_similarity");
  }

  const score = Math.min(
    100,
    breakdown.identity + breakdown.career + breakdown.title + breakdown.stack
  );
  if (score <= 0) return null;

  return {
    profileId: toIdString(profile?._id || profile?.id),
    score,
    matchReasons: reasons,
    breakdown,
    overlap: {
      exactCareerItems: careerOverlap.exactOverlap,
      companyOnlyCareerItems: careerOverlap.companyOnlyOverlap,
      titleTokenOverlap: titleSimilarity.overlap,
      stackTokenOverlap: stackSimilarity.overlap,
    },
    profileSnapshot: buildProfilePreview(profile),
  };
}

function isHighConfidenceMatch(match) {
  if (!match) return false;
  if (match.matchReasons.includes("email")) return true;
  if (match.matchReasons.includes("linkedin")) return true;
  if (
    match.matchReasons.includes("full_name") &&
    match.overlap?.exactCareerItems > 0
  ) {
    return true;
  }
  return match.score >= 70;
}

async function loadReadableProfilesForActor(actor, targetUserId = null) {
  const actorId = toIdString(actor?._id || actor?.id);
  const scopeUserId = toIdString(targetUserId) || actorId;
  const readableFilter = await buildReadableProfileFilterForUser(
    scopeUserId,
    {},
    {
      isGuest:
        Number(actor?.role) === RoleLevels.GUEST &&
        scopeUserId === actorId,
    }
  );

  const query = ProfileModel.find(readableFilter);
  if (typeof query.lean === "function") {
    return query.lean();
  }
  return query;
}

async function loadStacks() {
  const query = StackModel.find({});
  if (typeof query.select === "function") {
    const selected = query.select("_id title primarySkills SecondarySkills");
    if (typeof selected.lean === "function") {
      return selected.lean();
    }
    return selected;
  }
  if (typeof query.lean === "function") {
    return query.lean();
  }
  return query;
}

function buildWarnings({ contactInfo, careerHistory, educations, inferredSkills, stackSuggestions }) {
  const warnings = [];

  if (!contactInfo.email && !contactInfo.linkedin && !contactInfo.phone) {
    warnings.push("Contact details were not confidently detected from the resume text.");
  }
  if (!careerHistory.length) {
    warnings.push("No career history was extracted from the resume text.");
  }
  if (!educations.length) {
    warnings.push("No education records were extracted from the resume text.");
  }
  if (!inferredSkills.length) {
    warnings.push("No explicit skills were extracted from the resume text.");
  }
  if (!stackSuggestions.length) {
    warnings.push("No strong stack suggestion could be inferred from the imported resume.");
  }

  return warnings;
}

async function parseProfileImportText({ actor, text, targetUserId = null }) {
  const { result: parseResult, error: parseError } = await tryParseResumeTextWithLLM(text);
  if (parseError) {
    return { result: null, error: parseError };
  }

  const parsed = parseResult?.parsed || {};
  const fullName =
    toCleanString(parsed?.name) || extractLikelyNameFromText(text);
  const titleCandidates = buildTitleCandidates(parsed, text, fullName);
  const title = titleCandidates[0] || "";
  const contactInfo = {
    ...extractContactInfoFromText(text),
    address: extractAddressFromText(text, fullName),
  };
  const careerHistory = normalizeParsedCareerHistory(parsed?.experiences);
  const educations = normalizeParsedEducations(parsed?.education);
  const inferredSkills = flattenParsedSkillItems(parsed?.skills);

  const draft = {
    fullName,
    title,
    titleCandidates,
    mainStack: "",
    stackId: null,
    defaultTemplateId: null,
    link: contactInfo.linkedin || contactInfo.website || "",
    contactInfo,
    careerHistory,
    educations,
    sourceSummary: toCleanString(parsed?.summary),
    inferredSkills,
  };

  const [profiles, stacks] = await Promise.all([
    loadReadableProfilesForActor(actor, targetUserId),
    loadStacks(),
  ]);

  const stackSuggestions = suggestStacksForDraft(stacks, draft);
  if (stackSuggestions[0]) {
    draft.stackId = stackSuggestions[0].stackId || null;
    draft.mainStack = stackSuggestions[0].title || "";
  }

  const warnings = buildWarnings({
    contactInfo,
    careerHistory,
    educations,
    inferredSkills,
    stackSuggestions,
  });

  const missingRequiredFields = [];
  if (!draft.fullName) missingRequiredFields.push("fullName");
  if (!draft.title) missingRequiredFields.push("title");
  if (!draft.stackId) missingRequiredFields.push("stackId");

  draft.warnings = warnings;
  draft.missingRequiredFields = missingRequiredFields;
  draft.isReadyForCreate = missingRequiredFields.length === 0;
  draft.stackSuggestions = stackSuggestions;

  const matches = (Array.isArray(profiles) ? profiles : [])
    .map((profile) => scoreExistingProfileMatch(profile, draft))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const bestMatch = isHighConfidenceMatch(matches[0]) ? matches[0] : null;

  return {
    result: {
      draft,
      matches,
      bestMatch,
      createNewProfileSuggested: !bestMatch,
    },
    error: null,
  };
}

module.exports = {
  parseProfileImportText,
  _extractContactInfoFromText: extractContactInfoFromText,
  _suggestStacksForDraft: suggestStacksForDraft,
  _scoreExistingProfileMatch: scoreExistingProfileMatch,
  _buildTitleCandidates: buildTitleCandidates,
  _extractAddressFromText: extractAddressFromText,
};
