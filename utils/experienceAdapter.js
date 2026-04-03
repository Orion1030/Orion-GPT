/**
 * Adapter between Profile.careerHistory and Resume.experiences shapes.
 *
 * Profile experience fields:
 *   roleTitle, companyName, startDate, endDate, companySummary, keyPoints (rich-text string)
 *
 * Resume experience fields:
 *   title, companyName, companyLocation, summary, descriptions[], startDate, endDate
 */

function sanitizeString(value) {
  return String(value || "").trim();
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

function keyPointsToDescriptions(value) {
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

function descriptionsToKeyPoints(value) {
  let lines = [];

  if (Array.isArray(value)) {
    lines = value.map((item) => sanitizeString(item)).filter(Boolean);
  } else if (typeof value === "string" && value.trim()) {
    lines = keyPointsToDescriptions(value);
  }

  if (!lines.length) return "";

  const listItems = lines.map((line) =>
    /<[a-z][\s\S]*>/i.test(line)
      ? `<li>${line}</li>`
      : `<li>${escapeHtml(line)}</li>`
  );
  return `<ul>${listItems.join("")}</ul>`;
}

/**
 * Convert a single Profile experience to a Resume experience.
 * @param {object} profileExp
 * @returns {object}
 */
function profileExperienceToResumeExperience(profileExp) {
  return {
    title: profileExp.roleTitle || profileExp.title || "",
    companyName: profileExp.companyName || "",
    companyLocation: profileExp.companyLocation || "",
    summary: profileExp.companySummary || profileExp.summary || "",
    descriptions: Array.isArray(profileExp.descriptions)
      ? profileExp.descriptions
      : keyPointsToDescriptions(profileExp.keyPoints),
    startDate: profileExp.startDate || "",
    endDate: profileExp.endDate || "",
  };
}

/**
 * Convert a single Resume experience to a Profile experience.
 * @param {object} resumeExp
 * @returns {object}
 */
function resumeExperienceToProfileExperience(resumeExp) {
  const descriptions = Array.isArray(resumeExp.descriptions)
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
    companySummary: resumeExp.summary || resumeExp.companySummary || "",
    keyPoints: descriptionsToKeyPoints(descriptions),
  };
}

module.exports = { profileExperienceToResumeExperience, resumeExperienceToProfileExperience };
