/**
 * Adapter between Profile.careerHistory and Resume.experiences shapes.
 *
 * Profile experience fields:
 *   roleTitle, companyName, startDate, endDate, companySummary, keyPoints (rich-text string)
 *
 * Resume experience fields:
 *   title, companyName, companyLocation, bullets[], startDate, endDate
 */
const {
  buildEmploymentKey,
  areEmploymentsEquivalent,
  normalizeEmploymentText,
} = require("./employmentKey");

function sanitizeString(value) {
  return String(value || "").trim();
}

function normalizeDateString(value) {
  const raw = sanitizeString(value);
  if (!raw) return "";
  if (/^(present|current|ongoing|now)$/i.test(raw)) return "Present";
  if (value instanceof Date) {
    const date = value;
    if (Number.isNaN(date.getTime())) return raw;
    return date.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  // Normalize ISO-like date strings that include time components.
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return date.toISOString().slice(0, 10);
  return raw;
}

function stripHtml(value) {
  return sanitizeString(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return sanitizeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function keyPointsToBullets(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeString(item)).filter(Boolean);
  }

  if (typeof value !== "string" || !value.trim()) return [];
  const raw = value.trim();

  const htmlListItems = [...raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => sanitizeString(match[1]))
    .filter(Boolean);
  if (htmlListItems.length) return htmlListItems;

  const plainLines = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*•]+/, ""))
    .map((line) => stripHtml(line))
    .filter(Boolean);
  if (plainLines.length) return plainLines;

  const oneLine = stripHtml(raw);
  return oneLine ? [oneLine] : [];
}

function bulletsToKeyPoints(value) {
  let lines = [];

  if (Array.isArray(value)) {
    lines = value.map((item) => sanitizeString(item)).filter(Boolean);
  } else if (typeof value === "string" && value.trim()) {
    lines = keyPointsToBullets(value);
  }

  if (!lines.length) return "";

  const listItems = lines.map((line) =>
    /<[a-z][\s\S]*>/i.test(line)
      ? `<li>${line}</li>`
      : `<li>${escapeHtml(line)}</li>`
  );
  return `<ul>${listItems.join("")}</ul>`;
}

function mergeUniqueStrings(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const clean = sanitizeString(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/**
 * Normalize any resume/profile-like experience payload into Resume.experiences shape.
 * @param {object} value
 * @returns {object}
 */
function normalizeResumeExperience(value) {
  const legacySummary = sanitizeString(value?.summary ?? value?.companySummary);
  const normalizedBullets = Array.isArray(value?.bullets)
    ? value.bullets.map((item) => sanitizeString(item)).filter(Boolean)
    : Array.isArray(value?.descriptions)
      ? value.descriptions.map((item) => sanitizeString(item)).filter(Boolean)
      : keyPointsToBullets(value?.keyPoints);

  return {
    title: sanitizeString(value?.title ?? value?.roleTitle),
    companyName: sanitizeString(value?.companyName),
    companyLocation: sanitizeString(value?.companyLocation),
    bullets: mergeUniqueStrings([legacySummary, ...normalizedBullets]),
    startDate: normalizeDateString(value?.startDate),
    endDate: normalizeDateString(value?.endDate),
  };
}

function makeRoleCompanyKey(entry) {
  const role = normalizeEmploymentText(entry?.roleTitle ?? entry?.title);
  const company = normalizeEmploymentText(entry?.companyName);
  return `${company}|${role}`;
}

function makeCompanyKey(entry) {
  return normalizeEmploymentText(entry?.companyName);
}

function removeFirstMatch(items, predicate) {
  const index = items.findIndex(predicate);
  if (index < 0) return null;
  const [matched] = items.splice(index, 1);
  return matched;
}

/**
 * Align resume experiences to profile career history.
 * Profile start/end dates are treated as source-of-truth for matching roles.
 * @param {Array<object>} profileCareerHistory
 * @param {Array<object>} resumeExperiences
 * @returns {Array<object>}
 */
function alignResumeExperiencesToCareerHistory(profileCareerHistory, resumeExperiences) {
  const profileItems = Array.isArray(profileCareerHistory) ? profileCareerHistory : [];
  const candidateItems = Array.isArray(resumeExperiences) ? resumeExperiences : [];

  if (!profileItems.length) {
    return candidateItems.map((item) => normalizeResumeExperience(item));
  }

  const remainingCandidates = candidateItems.map((item) => normalizeResumeExperience(item));
  const aligned = [];

  for (const profileItem of profileItems) {
    const profileExperience = normalizeResumeExperience(profileExperienceToResumeExperience(profileItem));
    const exactProfileKey = buildEmploymentKey(profileItem, { roleFields: ["roleTitle", "title"] });
    const roleCompanyKey = makeRoleCompanyKey(profileItem);
    const companyKey = makeCompanyKey(profileItem);

    let matched = removeFirstMatch(
      remainingCandidates,
      (candidate) =>
        buildEmploymentKey(candidate, { roleFields: ["roleTitle", "title"] }) === exactProfileKey
    );

    if (!matched) {
      matched = removeFirstMatch(
        remainingCandidates,
        (candidate) =>
          areEmploymentsEquivalent(profileItem, candidate, {
            allowOpenEndDateMismatch: true,
            roleFields: ["roleTitle", "title"],
          })
      );
    }

    if (!matched && roleCompanyKey) {
      matched = removeFirstMatch(
        remainingCandidates,
        (candidate) => makeRoleCompanyKey(candidate) === roleCompanyKey
      );
    }

    if (!matched && companyKey) {
      matched = removeFirstMatch(
        remainingCandidates,
        (candidate) => makeCompanyKey(candidate) === companyKey
      );
    }

    const normalizedMatch = matched ? normalizeResumeExperience(matched) : null;
    aligned.push({
      title: profileExperience.title || normalizedMatch?.title || "",
      companyName: profileExperience.companyName || normalizedMatch?.companyName || "",
      companyLocation: normalizedMatch?.companyLocation || profileExperience.companyLocation || "",
      bullets: (normalizedMatch?.bullets || []).length
        ? normalizedMatch.bullets
        : profileExperience.bullets,
      startDate: profileExperience.startDate || normalizedMatch?.startDate || "",
      endDate: profileExperience.endDate || normalizedMatch?.endDate || "",
    });
  }

  return aligned;
}

/**
 * Convert a single Profile experience to a Resume experience.
 * @param {object} profileExp
 * @returns {object}
 */
function profileExperienceToResumeExperience(profileExp) {
  return normalizeResumeExperience({
    title: profileExp.roleTitle || profileExp.title || "",
    companyName: profileExp.companyName || "",
    companyLocation: profileExp.companyLocation || "",
    companySummary: profileExp.companySummary || profileExp.summary || "",
    bullets: Array.isArray(profileExp.bullets)
      ? profileExp.bullets
      : Array.isArray(profileExp.descriptions)
        ? profileExp.descriptions
        : keyPointsToBullets(profileExp.keyPoints),
    startDate: profileExp.startDate || "",
    endDate: profileExp.endDate || "",
  });
}

/**
 * Convert a single Resume experience to a Profile experience.
 * @param {object} resumeExp
 * @returns {object}
 */
function resumeExperienceToProfileExperience(resumeExp) {
  const bullets = Array.isArray(resumeExp.bullets)
    ? resumeExp.bullets
    : Array.isArray(resumeExp.descriptions)
      ? resumeExp.descriptions
    : Array.isArray(resumeExp.keyPoints)
      ? resumeExp.keyPoints
      : typeof resumeExp.keyPoints === "string"
        ? resumeExp.keyPoints
        : [];

  return {
    roleTitle: resumeExp.title || resumeExp.roleTitle || "",
    companyName: resumeExp.companyName || "",
    startDate: resumeExp.startDate || "",
    endDate: resumeExp.endDate || "",
    companySummary: resumeExp.companySummary || resumeExp.summary || "",
    keyPoints: bulletsToKeyPoints(bullets),
  };
}

module.exports = {
  profileExperienceToResumeExperience,
  resumeExperienceToProfileExperience,
  normalizeResumeExperience,
  alignResumeExperiencesToCareerHistory,
};
