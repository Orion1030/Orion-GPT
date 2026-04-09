function normalizeEmploymentText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmploymentDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "open";
  if (/^(present|current|ongoing|now)$/i.test(raw)) return "open";

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);

  const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return yearMatch[0];
  return normalizeEmploymentText(raw);
}

function readRoleValue(entry, roleFields) {
  for (const field of roleFields) {
    const candidate = String(entry?.[field] || "").trim();
    if (candidate) return candidate;
  }
  return "";
}

function getRoleFields(options) {
  const fields = Array.isArray(options?.roleFields) ? options.roleFields : [];
  return fields.length ? fields : ["roleTitle", "title"];
}

function normalizeEmploymentParts(entry, options = {}) {
  const roleFields = getRoleFields(options);
  return {
    companyName: normalizeEmploymentText(entry?.companyName),
    roleTitle: normalizeEmploymentText(readRoleValue(entry, roleFields)),
    startDate: normalizeEmploymentDate(entry?.startDate),
    endDate: normalizeEmploymentDate(entry?.endDate),
  };
}

function buildEmploymentBaseKey(entry, options = {}) {
  const parts = normalizeEmploymentParts(entry, options);
  return [parts.companyName, parts.roleTitle, parts.startDate].join("|");
}

function buildEmploymentKey(entry, options = {}) {
  const parts = normalizeEmploymentParts(entry, options);
  return [parts.companyName, parts.roleTitle, parts.startDate, parts.endDate].join("|");
}

function areEmploymentsEquivalent(left, right, options = {}) {
  const leftParts = normalizeEmploymentParts(left, options?.leftOptions || options);
  const rightParts = normalizeEmploymentParts(right, options?.rightOptions || options);
  const sameBase =
    leftParts.companyName === rightParts.companyName &&
    leftParts.roleTitle === rightParts.roleTitle &&
    leftParts.startDate === rightParts.startDate;
  if (!sameBase) return false;
  if (leftParts.endDate === rightParts.endDate) return true;
  if (!options?.allowOpenEndDateMismatch) return false;
  return leftParts.endDate === "open" || rightParts.endDate === "open";
}

module.exports = {
  normalizeEmploymentText,
  normalizeEmploymentDate,
  normalizeEmploymentParts,
  buildEmploymentBaseKey,
  buildEmploymentKey,
  areEmploymentsEquivalent,
};
